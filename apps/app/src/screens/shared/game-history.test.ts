import { describe, expect, it } from 'vitest';

import { createGameHistory, persistGameHistory, restoreGameHistory } from './game-history';

describe('persisted game history', () => {
  it('retains original deal and undo/redo positions across save and snapshot load', () => {
    const original = { cards: [1, 2, 3] };
    const history = createGameHistory(original);
    history.past = [{ cards: [1, 2] }];
    history.present.cards = [1];
    history.future = [{ cards: [] }];

    const envelope = persistGameHistory('test', history);
    const restored = restoreGameHistory<typeof original>(JSON.parse(JSON.stringify(envelope)));
    expect(restored).toEqual(history);
    restored.initial.cards.pop();
    restored.past[0].cards.pop();
    restored.present.cards.pop();
    restored.future[0].cards.push(4);
    expect(original.cards).toEqual([1, 2, 3]);
    expect(history).toEqual({
      initial: original, past: [{ cards: [1, 2] }], present: { cards: [1] }, future: [{ cards: [] }],
    });
    expect(envelope.state.cards).toEqual([1]);
  });

  it.each([undefined, { initial: null, past: [], future: [] }, { initial: {}, past: null, future: [] }])(
    'uses saved position as legacy restart point when history is absent or malformed: %s', (history) => {
      const envelope = JSON.parse(JSON.stringify({
        gameId: 'test', updatedAt: '2026-10-17', state: { cards: [2] }, history,
      }));
      expect(restoreGameHistory(envelope)).toEqual(createGameHistory(envelope.state));
    },
  );

  it('limits stored history while keeping nearest undo and redo positions', () => {
    const history = createGameHistory({ index: 60 });
    history.past = Array.from({ length: 60 }, (_, index) => ({ index }));
    history.future = Array.from({ length: 60 }, (_, index) => ({ index: index + 61 }));
    const restored = restoreGameHistory(persistGameHistory('test', history));

    expect(restored.past).toHaveLength(50);
    expect(restored.past[0]).toEqual({ index: 10 });
    expect(restored.future).toHaveLength(50);
    expect(restored.future[0]).toEqual({ index: 61 });
  });
});
