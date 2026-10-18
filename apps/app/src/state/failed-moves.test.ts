import { beforeEach, expect, it, vi } from 'vitest';
import { createClockGame } from '@mumscards/game-clock';
import { createFreeCellGame } from '@mumscards/game-freecell';
import { createKlondikeGame } from '@mumscards/game-klondike';
import type { FailedMoveRecord } from './failed-moves';

const storage = vi.hoisted(() => ({
  values: new Map<string, string>(), failRead: false, failWrite: false,
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
  removeItem: vi.fn<(key: string) => Promise<void>>(),
}));
vi.mock('./storage-adapter', () => ({
  storageAdapter: storage,
  withStorageLock: async <T,>(operation: () => Promise<T>) => operation(),
}));

function entry(id: string): FailedMoveRecord {
  return { schemaVersion: 1, id, occurredAt: '2026-10-18T00:00:00.000Z', game: 'klondike',
    interaction: 'drag', position: { stockCount: 24 },
    attempt: { kind: 'move', source: { zone: 'waste' }, destination: { zone: 'foundation', pileIndex: 0 } },
    rejection: { code: 'foundation-ace', message: 'Start an empty foundation with an Ace.' },
  };
}

beforeEach(() => {
  vi.resetModules();
  storage.values.clear(); storage.failRead = false; storage.failWrite = false;
  storage.getItem.mockReset().mockImplementation(async (key) => {
    if (storage.failRead) throw new Error('Read unavailable');
    return storage.values.get(key) ?? null;
  });
  storage.setItem.mockReset().mockImplementation(async (key, value) => {
    if (storage.failWrite) throw new Error('Write unavailable');
    storage.values.set(key, value);
  });
  storage.removeItem.mockReset().mockImplementation(async (key) => { storage.values.delete(key); });
});

it('merges persisted entries, exports one JSON record per line, and never writes game saves', async () => {
  const log = await import('./failed-moves');
  storage.values.set(log.FAILED_MOVES_KEY, JSON.stringify([entry('another-tab')]));
  storage.values.set('mumscards.saves', 'preserve this save');
  log.recordFailedMove(entry('first'));
  log.recordFailedMove(entry('second'));
  await log.retryFailedMoves();
  const exported = (await log.exportFailedMoves()).trim().split('\n').map((line) => JSON.parse(line));
  expect(exported.map((item) => item.id)).toEqual(['another-tab', 'first', 'second']);
  expect(exported[1]).toEqual(entry('first'));
  expect(storage.values.get('mumscards.saves')).toBe('preserve this save');
  expect(storage.setItem.mock.calls.every(([key]) => key === log.FAILED_MOVES_KEY)).toBe(true);
});

it('preserves unread logs and pending attempts after a read failure, then retries without duplicates', async () => {
  const log = await import('./failed-moves');
  const previous = JSON.stringify([entry('old')]);
  storage.values.set(log.FAILED_MOVES_KEY, previous);
  storage.failRead = true;
  log.recordFailedMove(entry('pending'));
  await log.retryFailedMoves();
  expect(storage.values.get(log.FAILED_MOVES_KEY)).toBe(previous);
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.failRead = false;
  await log.retryFailedMoves();
  await log.retryFailedMoves();
  expect(JSON.parse(storage.values.get(log.FAILED_MOVES_KEY)!)).toEqual([entry('old'), entry('pending')]);
});

it('keeps failed writes exportable in memory and saves them once storage recovers', async () => {
  const log = await import('./failed-moves');
  storage.failWrite = true;
  log.recordFailedMove(entry('pending'));
  await log.retryFailedMoves();
  expect(storage.values.has(log.FAILED_MOVES_KEY)).toBe(false);
  expect((await log.exportFailedMoves()).trim()).toBe(JSON.stringify(entry('pending')));
  storage.failWrite = false;
  await log.retryFailedMoves();
  expect(JSON.parse(storage.values.get(log.FAILED_MOVES_KEY)!)).toEqual([entry('pending')]);
});

it('clears earlier queued attempts while preserving an attempt made after Clear', async () => {
  const log = await import('./failed-moves');
  log.recordFailedMove(entry('before-1'));
  log.recordFailedMove(entry('before-2'));
  const clear = log.clearFailedMoves();
  log.recordFailedMove(entry('after'));
  await clear;
  await log.retryFailedMoves();
  expect(JSON.parse(storage.values.get(log.FAILED_MOVES_KEY)!)).toEqual([entry('after')]);
});

it('retains only the latest 200 attempts and refuses to overwrite an unreadable log', async () => {
  const log = await import('./failed-moves');
  storage.values.set(log.FAILED_MOVES_KEY, JSON.stringify(Array.from({ length: 200 }, (_, index) => entry(`${index}`))));
  log.recordFailedMove(entry('newest'));
  await log.retryFailedMoves();
  const entries: FailedMoveRecord[] = JSON.parse(storage.values.get(log.FAILED_MOVES_KEY)!);
  expect(entries).toHaveLength(200);
  expect(entries[0].id).toBe('1');
  expect(entries.at(-1)?.id).toBe('newest');
  storage.values.set(log.FAILED_MOVES_KEY, '{unreadable');
  log.recordFailedMove(entry('pending'));
  await log.retryFailedMoves();
  expect(storage.values.get(log.FAILED_MOVES_KEY)).toBe('{unreadable');
  await expect(log.exportFailedMoves()).rejects.toThrow();
  await log.clearFailedMoves();
  expect(await log.exportFailedMoves()).toBe('');
});

it('redacts concealed cards and stock identities while retaining visible cards and active rules', async () => {
  const { trainingPosition, visibleJson } = await import('./failed-moves');
  const state = createKlondikeGame(() => 0.5, { emptyTableauPolicy: 'king-only' });
  const output = JSON.parse(JSON.stringify(trainingPosition(state)));
  expect(output.stock).toBeUndefined();
  expect(output.stockCount).toBe(24);
  expect(output.emptyTableauPolicy).toBe('king-only');
  expect(output.tableau[1][0]).toEqual({ faceUp: false });
  expect(output.tableau[1][1]).toMatchObject({ rank: state.tableau[1][1].rank, suit: state.tableau[1][1].suit });
  expect(JSON.stringify(output)).not.toContain('"id"');
  expect(visibleJson({ source: { zone: 'hour', cardId: 'hidden-identity', hourIndex: 2 } }))
    .toEqual({ source: { zone: 'hour', hourIndex: 2 } });
  const clock = createClockGame(() => 0.5);
  const clockOutput = JSON.parse(JSON.stringify(trainingPosition(clock)));
  expect(clockOutput.stockPiles).toBeUndefined();
  expect(clockOutput.stockCounts).toEqual([1, 1, 1, 1]);
  expect(clockOutput.hours.every((pile: { hiddenCount: number; placedCards: unknown[] }) => pile.hiddenCount === 4 && pile.placedCards.length === 0)).toBe(true);
  const freecell = createFreeCellGame(() => 0.5);
  delete freecell.tableauBuildPolicy;
  expect(trainingPosition(freecell)).toMatchObject({ tableauBuildPolicy: 'alternate-red-black' });
});
