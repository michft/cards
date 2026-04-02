import { describe, expect, it } from 'vitest';

import {
  createPyramidGame,
  drawPyramidStock,
  getPyramidSourceCard,
  isPyramidSourceSelectable,
  recyclePyramidWaste,
  removePyramidCards,
} from '../src/engine';
import type { PyramidState } from '../src/types';

function baseState(): PyramidState {
  return {
    gameId: 'pyramid',
    tableau: [
      [{ id: 'r1', suit: 'spades', rank: 6, color: 'black' }],
      [
        { id: 'r2l', suit: 'hearts', rank: 7, color: 'red' },
        { id: 'r2r', suit: 'clubs', rank: 5, color: 'black' },
      ],
      [
        { id: 'r3l', suit: 'diamonds', rank: 8, color: 'red' },
        { id: 'r3m', suit: 'spades', rank: 5, color: 'black' },
        { id: 'r3r', suit: 'hearts', rank: 1, color: 'red' },
      ],
      [null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null, null],
      [null, null, null, null, null, null, null],
    ],
    stock: [],
    waste: [],
    removedCount: 0,
    recyclesUsed: 0,
    maxRecycles: 2,
    won: false,
  };
}

describe('createPyramidGame', () => {
  it('deals 28 cards into a 7-row pyramid and leaves 24 in stock', () => {
    const state = createPyramidGame(() => 0.5);
    const tableauCount = state.tableau.reduce(
      (total, row) => total + row.filter((card) => card !== null).length,
      0,
    );

    expect(state.tableau.map((row) => row.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(tableauCount).toBe(28);
    expect(state.stock).toHaveLength(24);
  });
});

describe('removePyramidCards', () => {
  it('removes exposed pair summing to 13', () => {
    const state = baseState();
    const next = removePyramidCards(state, [
      { zone: 'tableau', rowIndex: 2, cardIndex: 0 },
      { zone: 'tableau', rowIndex: 2, cardIndex: 1 },
    ]);

    expect(next.tableau[2][0]).toBeNull();
    expect(next.tableau[2][1]).toBeNull();
    expect(next.removedCount).toBe(2);
  });

  it('removes a king-like single card only for rank 13', () => {
    const state: PyramidState = {
      ...baseState(),
      waste: [{ id: 'k-h', suit: 'hearts', rank: 13, color: 'red' }],
    };

    const next = removePyramidCards(state, [{ zone: 'waste' }]);
    expect(next.waste).toHaveLength(0);
    expect(next.removedCount).toBe(1);
  });
});

describe('stock and waste', () => {
  it('draws one card from stock to waste', () => {
    const state: PyramidState = {
      ...baseState(),
      stock: [{ id: 's1', suit: 'spades', rank: 2, color: 'black' }],
      waste: [],
    };

    const next = drawPyramidStock(state);
    expect(next.stock).toHaveLength(0);
    expect(next.waste.map((card) => card.id)).toEqual(['s1']);
  });

  it('recycles waste in same user-visible order on next pass', () => {
    const state: PyramidState = {
      ...baseState(),
      stock: [],
      waste: [
        { id: 'a', suit: 'spades', rank: 1, color: 'black' },
        { id: 'b', suit: 'hearts', rank: 2, color: 'red' },
        { id: 'c', suit: 'clubs', rank: 3, color: 'black' },
      ],
      recyclesUsed: 0,
      maxRecycles: 2,
    };

    const recycled = recyclePyramidWaste(state);
    const draw1 = drawPyramidStock(recycled);
    const draw2 = drawPyramidStock(draw1);
    const draw3 = drawPyramidStock(draw2);

    expect(draw1.waste.map((card) => card.id)).toEqual(['a']);
    expect(draw2.waste.map((card) => card.id)).toEqual(['a', 'b']);
    expect(draw3.waste.map((card) => card.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('selectability', () => {
  it('blocks covered tableau cards', () => {
    const state = baseState();
    expect(isPyramidSourceSelectable(state, { zone: 'tableau', rowIndex: 0, cardIndex: 0 })).toBe(
      false,
    );
    expect(isPyramidSourceSelectable(state, { zone: 'tableau', rowIndex: 2, cardIndex: 0 })).toBe(
      true,
    );
  });

  it('returns source card only when selectable', () => {
    const state = baseState();
    const covered = getPyramidSourceCard(state, { zone: 'tableau', rowIndex: 0, cardIndex: 0 });
    const exposed = getPyramidSourceCard(state, { zone: 'tableau', rowIndex: 2, cardIndex: 2 });

    expect(covered).toBeNull();
    expect(exposed?.id).toBe('r3r');
  });

  it('allows selecting a half-blocked parent when the single blocker complements to 13', () => {
    const state: PyramidState = {
      gameId: 'pyramid',
      tableau: [
        [{ id: 'j', suit: 'spades', rank: 11, color: 'black' }],
        [null, { id: '2', suit: 'hearts', rank: 2, color: 'red' }],
        [null, null, null],
        [null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null, null],
      ],
      stock: [],
      waste: [],
      removedCount: 0,
      recyclesUsed: 0,
      maxRecycles: 2,
      won: false,
    };

    expect(isPyramidSourceSelectable(state, { zone: 'tableau', rowIndex: 0, cardIndex: 0 })).toBe(
      true,
    );

    const next = removePyramidCards(state, [
      { zone: 'tableau', rowIndex: 0, cardIndex: 0 },
      { zone: 'tableau', rowIndex: 1, cardIndex: 1 },
    ]);

    expect(next.tableau[0][0]).toBeNull();
    expect(next.tableau[1][1]).toBeNull();
  });

  it('blocks half-blocked parent removal when both children are occupied', () => {
    const state: PyramidState = {
      gameId: 'pyramid',
      tableau: [
        [{ id: 'j', suit: 'spades', rank: 11, color: 'black' }],
        [
          { id: '5', suit: 'clubs', rank: 5, color: 'black' },
          { id: '2', suit: 'hearts', rank: 2, color: 'red' },
        ],
        [null, null, null],
        [null, null, null, null],
        [null, null, null, null, null],
        [null, null, null, null, null, null],
        [null, null, null, null, null, null, null],
      ],
      stock: [],
      waste: [],
      removedCount: 0,
      recyclesUsed: 0,
      maxRecycles: 2,
      won: false,
    };

    expect(isPyramidSourceSelectable(state, { zone: 'tableau', rowIndex: 0, cardIndex: 0 })).toBe(
      false,
    );

    const next = removePyramidCards(state, [
      { zone: 'tableau', rowIndex: 0, cardIndex: 0 },
      { zone: 'tableau', rowIndex: 1, cardIndex: 1 },
    ]);

    expect(next).toEqual(state);
  });
});
