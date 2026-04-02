import { describe, expect, it } from 'vitest';

import {
  applyKlondikeMove,
  canAutoComplete,
  createKlondikeGame,
  drawFromStock,
  getHint,
  recycleWaste,
} from '../src/engine';
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
    expect(
      state.tableau.map((pile) => pile.filter((card) => !card.faceUp).length),
    ).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('supports draw-one rule variant', () => {
    const state = createKlondikeGame(() => 0.5, { drawCount: 1 });
    const next = drawFromStock(state);

    expect(state.drawCount).toBe(1);
    expect(next.waste).toHaveLength(1);
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

  it('allows moving a non-king tableau run to an empty tableau', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [
        [card('6-s', 'spades', 6), card('5-h', 'hearts', 5)],
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
      destination: { zone: 'tableau', pileIndex: 1 },
    });

    expect(next.tableau[0]).toHaveLength(0);
    expect(next.tableau[1].map((current) => current.id)).toEqual(['6-s', '5-h']);
  });

  it('blocks non-king moves to empty tableau when set to king-only', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [
        [card('6-s', 'spades', 6), card('5-h', 'hearts', 5)],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };

    const next = applyKlondikeMove(
      state,
      {
        kind: 'move',
        source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
        destination: { zone: 'tableau', pileIndex: 1 },
      },
      { emptyTableauPolicy: 'king-only' },
    );

    expect(next.tableau[0].map((current) => current.id)).toEqual(['6-s', '5-h']);
    expect(next.tableau[1]).toHaveLength(0);
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

    expect(hint?.move.kind).toBe('move');

    if (!hint || hint.move.kind !== 'move') {
      throw new Error('Expected a move hint.');
    }

    expect(hint.move.source).toEqual({ zone: 'tableau', pileIndex: 0, cardIndex: 1 });
    expect(hint.move.destination.zone).toBe('tableau');
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

  it('preserves draw order after recycling the waste back into stock', () => {
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: [
        card('4-h', 'hearts', 4),
        card('5-c', 'clubs', 5),
        card('6-d', 'diamonds', 6),
        card('a-c', 'clubs', 1),
        card('2-d', 'diamonds', 2),
        card('3-s', 'spades', 3),
      ],
      waste: [],
      foundations: [[], [], [], []],
      tableau: [[], [], [], [], [], [], []],
    };

    const firstDraw = drawFromStock(state);
    const secondDraw = drawFromStock(firstDraw);
    const recycled = recycleWaste(secondDraw);
    const redrawOne = drawFromStock(recycled);
    const redrawTwo = drawFromStock(redrawOne);

    expect(firstDraw.waste.map((current) => current.id)).toEqual(['a-c', '2-d', '3-s']);
    expect(secondDraw.waste.slice(-3).map((current) => current.id)).toEqual(['4-h', '5-c', '6-d']);
    expect(redrawOne.waste.map((current) => current.id)).toEqual(['a-c', '2-d', '3-s']);
    expect(redrawTwo.waste.slice(-3).map((current) => current.id)).toEqual(['4-h', '5-c', '6-d']);
  });
});
