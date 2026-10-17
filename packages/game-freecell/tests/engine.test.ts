import { describe, expect, it } from 'vitest';
import type { PlayingCard } from '@mumscards/engine-core';

import { applyFreeCellMove, createFreeCellGame } from '../src/engine';
import type { FreeCellState } from '../src/types';

describe('createFreeCellGame', () => {
  it('retains the dealt tableau policy when restored after settings change', () => {
    const dealt = createFreeCellGame(() => 0.5, { tableauBuildPolicy: 'suit-matching' });
    const game: FreeCellState = {
      ...dealt,
      tableau: [
        [{ id: 'src', suit: 'hearts', rank: 6, color: 'red' }],
        [{ id: 'dst', suit: 'spades', rank: 7, color: 'black' }],
        [], [], [], [], [], [],
      ],
    };
    const source = { zone: 'tableau', pileIndex: 0, cardIndex: 0 } as const;
    const destination = { zone: 'tableau', pileIndex: 1 } as const;

    expect(dealt.tableauBuildPolicy).toBe('suit-matching');
    expect(applyFreeCellMove(game, source, destination)).toBe(game);
    const explicitlyOverridden = applyFreeCellMove(game, source, destination, {
      tableauBuildPolicy: 'alternate-red-black',
    });
    expect(explicitlyOverridden.tableau[1]).toHaveLength(2);
    expect(explicitlyOverridden.tableauBuildPolicy).toBe('suit-matching');
  });

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

  it('limits tableau stack moves to empty free cells + 1 without auxiliary columns', () => {
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
        ...Array.from({ length: 5 }, (_, index) => [
          { id: `occupied-${index}`, suit: 'spades' as const, rank: 13 as const, color: 'black' as const },
        ]),
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

  it.each(['alternate-red-black', 'any', 'suit-matching'] as const)(
    'uses auxiliary empty columns for supermoves under %s builds',
    (tableauBuildPolicy) => {
      const run: PlayingCard[] = Array.from({ length: 8 }, (_, index) => {
        const red = tableauBuildPolicy === 'suit-matching' || index % 2 === 0;
        return {
          id: `run-${index}`,
          suit: red ? 'hearts' : 'spades',
          rank: (12 - index) as PlayingCard['rank'],
          color: red ? 'red' : 'black',
        };
      });
      const king: PlayingCard = {
        id: 'target', suit: tableauBuildPolicy === 'suit-matching' ? 'hearts' : 'clubs',
        rank: 13, color: tableauBuildPolicy === 'suit-matching' ? 'red' : 'black',
      };
      const game: FreeCellState = {
        ...createFreeCellGame(() => 0.5, { tableauBuildPolicy }),
        tableau: [run, [king], [], [], ...Array.from({ length: 4 }, () => [king])],
        freeCells: [king, king, king, null],
      };
      const source = { zone: 'tableau', pileIndex: 0, cardIndex: 0 } as const;

      // (one free cell + 1) * 2^two auxiliary columns = eight cards.
      const moved = applyFreeCellMove(game, source, { zone: 'tableau', pileIndex: 1 });
      expect(moved.tableau[1]).toHaveLength(9);
      expect(moved.tableau[0]).toHaveLength(0);
      // An empty destination cannot also serve as an auxiliary column: limit four.
      expect(applyFreeCellMove(game, source, { zone: 'tableau', pileIndex: 2 })).toBe(game);
      const partial = applyFreeCellMove(
        game, { ...source, cardIndex: 4 }, { zone: 'tableau', pileIndex: 2 },
      );
      expect(partial.tableau[2]).toHaveLength(4);
    },
  );

  it.each([
    { freeCells: 4, emptyColumns: 2, runLength: 12, allowed: true },
    { freeCells: 0, emptyColumns: 1, runLength: 2, allowed: true },
    { freeCells: 0, emptyColumns: 1, runLength: 3, allowed: false },
  ])('respects supermove capacity with $freeCells free cells and $emptyColumns empty columns', ({
    freeCells, emptyColumns, runLength, allowed,
  }) => {
    const run: PlayingCard[] = Array.from({ length: runLength }, (_, index) => ({
      id: `run-${index}`, suit: index % 2 === 0 ? 'hearts' : 'spades',
      rank: (12 - index) as PlayingCard['rank'], color: index % 2 === 0 ? 'red' : 'black',
    }));
    const king: PlayingCard = { id: 'king', suit: 'clubs', rank: 13, color: 'black' };
    const game: FreeCellState = {
      ...createFreeCellGame(() => 0.5),
      tableau: [run, [king], ...Array.from({ length: 6 }, (_, index) => index < emptyColumns ? [] : [king])],
      freeCells: Array.from({ length: 4 }, (_, index) => index < freeCells ? null : king),
    };
    const next = applyFreeCellMove(
      game, { zone: 'tableau', pileIndex: 0, cardIndex: 0 }, { zone: 'tableau', pileIndex: 1 },
    );
    expect(next.tableau[1]).toHaveLength(allowed ? runLength + 1 : 1);
  });
});
