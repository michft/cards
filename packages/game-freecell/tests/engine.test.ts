import { describe, expect, it } from 'vitest';

import { applyFreeCellMove, createFreeCellGame } from '../src/engine';
import type { FreeCellState } from '../src/types';

describe('createFreeCellGame', () => {
  it('deals 52 cards across 8 tableau piles', () => {
    const game = createFreeCellGame(() => 0.5);
    const count = game.tableau.reduce((total, pile) => total + pile.length, 0);
    const sizes = game.tableau.map((pile) => pile.length);

    expect(count).toBe(52);
    expect(sizes.slice(0, 4)).toEqual([7, 7, 7, 7]);
    expect(sizes.slice(4)).toEqual([6, 6, 6, 6]);
  });

  it('allows moving top tableau card to empty free cell', () => {
    const game = createFreeCellGame(() => 0.5);
    const firstPileTop = game.tableau[0][game.tableau[0].length - 1];
    const moved = applyFreeCellMove(
      game,
      { zone: 'tableau', pileIndex: 0, cardIndex: game.tableau[0].length - 1 },
      { zone: 'cell', cellIndex: 0 },
    );

    expect(moved.freeCells[0]?.id).toBe(firstPileTop.id);
    expect(moved.tableau[0].length).toBe(game.tableau[0].length - 1);
  });

  it('supports tableau build policies', () => {
    const base = createFreeCellGame(() => 0.5);
    const game: FreeCellState = {
      ...base,
      tableau: [
        [{ id: 'src', suit: 'hearts', rank: 6, color: 'red' }],
        [{ id: 'dst', suit: 'diamonds', rank: 7, color: 'red' }],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      freeCells: [null, null, null, null],
      foundations: [[], [], [], []],
      won: false,
    };

    const anyMove = applyFreeCellMove(
      game,
      { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      { zone: 'tableau', pileIndex: 1 },
      { tableauBuildPolicy: 'any' },
    );
    expect(anyMove.tableau[1]).toHaveLength(2);

    const suitMatchBlocked = applyFreeCellMove(
      game,
      { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      { zone: 'tableau', pileIndex: 1 },
      { tableauBuildPolicy: 'suit-matching' },
    );
    expect(suitMatchBlocked.tableau[1]).toHaveLength(1);
  });

  it('limits tableau stack moves to empty free cells + 1', () => {
    const base = createFreeCellGame(() => 0.5);
    const game: FreeCellState = {
      ...base,
      tableau: [
        [
          { id: 's1', suit: 'spades', rank: 6, color: 'black' },
          { id: 's2', suit: 'hearts', rank: 5, color: 'red' },
          { id: 's3', suit: 'clubs', rank: 4, color: 'black' },
        ],
        [{ id: 'dst-a', suit: 'clubs', rank: 6, color: 'black' }],
        [{ id: 'dst-b', suit: 'hearts', rank: 7, color: 'red' }],
        [],
        [],
        [],
        [],
        [],
        [{ id: 'occ', suit: 'spades', rank: 13, color: 'black' }],
      ],
      freeCells: [
        { id: 'f1', suit: 'spades', rank: 12, color: 'black' },
        { id: 'f2', suit: 'hearts', rank: 12, color: 'red' },
        { id: 'f3', suit: 'clubs', rank: 12, color: 'black' },
        null,
      ],
      foundations: [[], [], [], []],
      won: false,
    };

    const allowed = applyFreeCellMove(
      game,
      { zone: 'tableau', pileIndex: 0, cardIndex: 1 },
      { zone: 'tableau', pileIndex: 1 },
      { tableauBuildPolicy: 'alternate-red-black' },
    );
    expect(allowed.tableau[1]).toHaveLength(3);

    const blocked = applyFreeCellMove(
      game,
      { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      { zone: 'tableau', pileIndex: 2 },
      { tableauBuildPolicy: 'alternate-red-black' },
    );
    expect(blocked.tableau[2]).toHaveLength(1);
  });
});
