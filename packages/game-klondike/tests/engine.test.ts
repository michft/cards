import { describe, expect, it } from 'vitest';

import { applyKlondikeMove, canAutoComplete, createKlondikeGame, getHint } from '../src/engine';
import type { KlondikeState, KlondikeTableauCard } from '../src/types';

function card(
  id: string,
  suit: 'clubs' | 'diamonds' | 'hearts' | 'spades',
  rank: number,
  faceUp = true,
): KlondikeTableauCard {
  return {
    id,
    suit,
    rank: rank as KlondikeTableauCard['rank'],
    color: suit === 'diamonds' || suit === 'hearts' ? 'red' : 'black',
    faceUp,
  };
}

describe('Klondike engine', () => {
  it('deals a valid starting layout', () => {
    const state = createKlondikeGame(() => 0.5);

    expect(state.stock).toHaveLength(24);
    expect(state.tableau.map((pile) => pile.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state.tableau.every((pile) => pile[pile.length - 1]?.faceUp)).toBe(true);
  });

  it('moves an ace to foundation', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [
        [card('a-h', 'hearts', 1)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };

    const next = applyKlondikeMove(state, {
      kind: 'move',
      source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      destination: { zone: 'foundation', pileIndex: 0 },
    });

    expect(next.foundations[0]).toHaveLength(1);
    expect(next.tableau[0]).toHaveLength(0);
  });

  it('prefers revealing hidden cards in balanced hint mode', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [
        [card('k-s', 'spades', 13, false), card('q-h', 'hearts', 12)],
        [card('k-c', 'clubs', 13)],
        [],
        [],
        [],
        [],
        [],
      ],
    };

    const hint = getHint(state, 'balanced');

    expect(hint?.move).toEqual({
      kind: 'move',
      source: { zone: 'tableau', pileIndex: 0, cardIndex: 1 },
      destination: { zone: 'tableau', pileIndex: 1 },
    });
  });

  it('recognizes auto-complete ready states', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [],
      waste: [],
      foundations: [
        [card('a-c', 'clubs', 1)],
        [],
        [],
        [],
      ],
      tableau: [
        [card('2-c', 'clubs', 2)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };

    expect(canAutoComplete(state)).toBe(true);
  });
});
