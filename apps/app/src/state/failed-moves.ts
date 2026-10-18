import { useEffect, useSyncExternalStore } from 'react';

import type { GameStateMap, GameVariant } from './types';
import { storageAdapter, withStorageLock } from './storage-adapter';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type FailedMoveAttempt = {
  kind: 'move' | 'select' | 'draw' | 'deal' | 'recycle' | 'remove';
  source?: object;
  destination?: object | null;
};
export type FailedMoveRecord = {
  schemaVersion: 1;
  id: string;
  occurredAt: string;
  game: GameVariant;
  interaction: 'press' | 'drag';
  position: JsonValue;
  attempt: JsonValue;
  rejection: { code: string; message: string };
};

export const FAILED_MOVES_KEY = 'mumscards.failed-moves';
export const FAILED_MOVE_LIMIT = 200;
const initialInfo = { count: 0, pending: 0, error: null as string | null, loading: true };
let info = initialInfo;
let pending: FailedMoveRecord[] = [];
let queue = Promise.resolve();
const listeners = new Set<() => void>();

function update(patch: Partial<typeof info>) {
  info = { ...info, ...patch };
  listeners.forEach((listener) => listener());
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only information visible to the player belongs in a training example. */
export function trainingPosition(state: GameStateMap[GameVariant]): JsonValue {
  if (state.gameId === 'freecell') {
    return visibleJson({ ...state, tableauBuildPolicy: state.tableauBuildPolicy ?? 'alternate-red-black' });
  }
  if (state.gameId === 'clock') {
    const { hours, stockPiles, stock, kings, placedCardIds, returnedKingIds, ...rest } = state;
    const placed = new Set(placedCardIds);
    return visibleJson({ ...rest, kings,
      hours: hours.map((pile) => ({
        hiddenCount: pile.filter((card) => !placed.has(card.id)).length,
        placedCards: pile.filter((card) => placed.has(card.id)),
      })),
      stockCounts: stockPiles.map((pile) => pile.length),
      returnedKingCount: returnedKingIds.length,
    });
  }
  if ('stock' in state) {
    const { stock, ...rest } = state;
    return visibleJson({ ...rest, stockCount: stock.length,
      ...(state.gameId === 'klondike' ? { emptyTableauPolicy: state.emptyTableauPolicy ?? 'any' } : {}),
    });
  }
  return visibleJson(state);
}

export function visibleJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(visibleJson);
  if (record(value)) {
    if (value.faceUp === false) return { faceUp: false };
    return Object.fromEntries(Object.entries(value)
      .filter(([key, item]) => key !== 'id' && key !== 'cardId' && item !== undefined)
      .map(([key, item]) => [key, visibleJson(item)]));
  }
  return null;
}

async function storedRecords(): Promise<FailedMoveRecord[]> {
  const raw = await storageAdapter.getItem(FAILED_MOVES_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((item) => record(item)
    && item.schemaVersion === 1 && typeof item.id === 'string'
    && typeof item.occurredAt === 'string'
    && ['clock', 'freecell', 'klondike', 'pyramid', 'spider'].includes(String(item.game))
    && (item.interaction === 'press' || item.interaction === 'drag')
    && record(item.rejection) && typeof item.rejection.code === 'string'
    && typeof item.rejection.message === 'string' && 'position' in item && 'attempt' in item)) {
    throw new Error('The saved failed-move log is unreadable. Clear it to start a new log.');
  }
  return parsed.slice(-FAILED_MOVE_LIMIT) as FailedMoveRecord[];
}

function enqueue(operation: () => Promise<void>): Promise<void> {
  queue = queue.then(() => withStorageLock(operation)).catch(() => {
    update({ loading: false, pending: pending.length,
      error: 'Failed-move log could not be saved or read. Keep this page open and retry in Settings.' });
  });
  return queue;
}

export function recordFailedMove(entry: FailedMoveRecord): void {
  pending = [...pending, entry].slice(-FAILED_MOVE_LIMIT);
  update({ pending: pending.length });
  void retryFailedMoves();
}

export function retryFailedMoves(): Promise<void> {
  const requested = [...pending];
  return enqueue(async () => {
    const stored = await storedRecords();
    const pendingIds = new Set(pending.map((entry) => entry.id));
    const batch = requested.filter((entry) => pendingIds.has(entry.id));
    const ids = new Set(stored.map((entry) => entry.id));
    const merged = [...stored, ...batch.filter((entry) => !ids.has(entry.id))].slice(-FAILED_MOVE_LIMIT);
    if (batch.length) await storageAdapter.setItem(FAILED_MOVES_KEY, JSON.stringify(merged));
    const savedIds = new Set(batch.map((entry) => entry.id));
    pending = pending.filter((entry) => !savedIds.has(entry.id));
    update({ count: merged.length, pending: pending.length, error: null, loading: false });
  });
}

export async function exportFailedMoves(): Promise<string> {
  await retryFailedMoves();
  // Pending entries remain exportable when saving fails, without replacing unread data.
  let entries = [...pending];
  await withStorageLock(async () => {
    const stored = await storedRecords();
    const ids = new Set(stored.map((entry) => entry.id));
    entries = [...stored, ...pending.filter((entry) => !ids.has(entry.id))].slice(-FAILED_MOVE_LIMIT);
  });
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + (entries.length ? '\n' : '');
}

export function clearFailedMoves(): Promise<void> {
  const clearedIds = new Set(pending.map((entry) => entry.id));
  return enqueue(async () => {
    await storageAdapter.removeItem(FAILED_MOVES_KEY);
    pending = pending.filter((entry) => !clearedIds.has(entry.id));
    update({ count: 0, pending: pending.length, error: null, loading: false });
  });
}

export function useFailedMoveLog(load = true) {
  const current = useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, () => info, () => initialInfo);
  useEffect(() => {
    if (!load) return;
    void retryFailedMoves();
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const changed = (event: StorageEvent) => {
      if (event.key === FAILED_MOVES_KEY || event.key === null) void retryFailedMoves();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [load]);
  return current;
}
