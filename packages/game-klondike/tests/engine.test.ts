import { describe, expect, it } from 'vitest';
import { createDeck, SUITS } from '@mumscards/engine-core';

import {
  applyKlondikeMove,
  canAutoComplete,
  createKlondikeGame,
  drawFromStock,
  getHint,
  getHints,
  getLegalMoves,
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
  function shuffleLoopState(): KlondikeState {
    return {
      gameId: 'klondike', drawCount: 1, emptyTableauPolicy: 'king-only', completed: false,
      stock: [card('stock-four', 'diamonds', 4), card('stock-ace', 'clubs', 1)],
      waste: [], foundations: [[], [], [], []],
      tableau: [
        [card('seven-clubs', 'clubs', 7), card('six-hearts', 'hearts', 6)],
        [card('seven-spades', 'spades', 7)], [], [], [], [], [],
      ],
    };
  }

  it.each(['balanced', 'mobility', 'foundation-first'] as const)(
    'draws instead of bouncing a face-up card between columns in %s mode',
    (mode) => {
      let state = shuffleLoopState();
      expect(getHint(state, mode)?.move).toEqual({ kind: 'draw' });
      for (let index = 0; index < 8; index += 1) {
        const hint = getHint(state, mode);
        if (!hint) break;
        expect(hint.move.kind === 'move' && hint.move.destination.zone === 'tableau').toBe(false);
        state = applyKlondikeMove(state, hint.move);
      }
    },
  );

  it.each(['king-only', 'any'] as const)(
    'offers no reversible shuffle with exhausted stock and %s empty columns',
    (emptyTableauPolicy) => {
      const state = { ...shuffleLoopState(), stock: [], emptyTableauPolicy };
      expect(getHint(state)).toBeNull();
      expect(getLegalMoves(state)).toContainEqual({
        kind: 'move', source: { zone: 'tableau', pileIndex: 0, cardIndex: 1 },
        destination: { zone: 'tableau', pileIndex: 1 },
      });
    },
  );

  it('keeps a face-up move that frees a tableau column', () => {
    const state = shuffleLoopState();
    state.tableau[0] = [card('six-hearts', 'hearts', 6)];
    expect(getHint(state)?.move).toEqual({
      kind: 'move', source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      destination: { zone: 'tableau', pileIndex: 1 },
    });
  });

  it('keeps a face-up rearrangement that makes a foundation promotion available', () => {
    const state = shuffleLoopState();
    state.foundations[0] = createDeck('foundation').filter(
      (current) => current.suit === 'clubs' && current.rank <= 6,
    );
    expect(getHint(state)?.move).toEqual({
      kind: 'move', source: { zone: 'tableau', pileIndex: 0, cardIndex: 1 },
      destination: { zone: 'tableau', pileIndex: 1 },
    });
  });

  it('hints draw instead of looping whole piles through empty columns', () => {
    const deck = createDeck('hint-loop');
    const state: KlondikeState = {
      gameId: 'klondike',
      drawCount: 3,
      completed: false,
      stock: deck.filter((current) => current.suit === 'hearts' && [11, 12].includes(current.rank)),
      waste: [],
      foundations: SUITS.map((suit) => deck.filter(
        (current) => current.suit === suit && (suit !== 'hearts' || current.rank <= 10),
      )),
      tableau: [
        [card('hint-loop-hearts-13', 'hearts', 13)],
        [], [], [], [], [], [],
      ],
    };

    expect(getHint(state)?.move).toEqual({ kind: 'draw' });
    for (const mode of ['balanced', 'mobility', 'foundation-first'] as const) {
      expect(getHints(state, mode).filter((hint) =>
        hint.move.kind === 'move' && hint.move.source.zone === 'tableau',
      )).toHaveLength(0);
    }
    expect(getLegalMoves(state)).toContainEqual({
      kind: 'move',
      source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      destination: { zone: 'tableau', pileIndex: 1 },
    });
    const moved = applyKlondikeMove(state, {
      kind: 'move',
      source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      destination: { zone: 'tableau', pileIndex: 1 },
    });
    expect(moved.tableau[1][0]?.rank).toBe(13);
  });

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

  it('retains the dealt empty-tableau rule when restored after settings change', () => {
    const dealt = createKlondikeGame(() => 0.5, { emptyTableauPolicy: 'king-only' });
    const state: KlondikeState = {
      ...dealt,
      stock: [],
      tableau: [[card('six', 'spades', 6)], [], [], [], [], [], []],
    };
    const move = {
      kind: 'move',
      source: { zone: 'tableau', pileIndex: 0, cardIndex: 0 },
      destination: { zone: 'tableau', pileIndex: 1 },
    } as const;

    expect(dealt.emptyTableauPolicy).toBe('king-only');
    expect(applyKlondikeMove(state, move).tableau[1]).toHaveLength(0);
    expect(getLegalMoves(state)).not.toContainEqual(move);
    const explicitlyOverridden = applyKlondikeMove(state, move, { emptyTableauPolicy: 'any' });
    expect(explicitlyOverridden.tableau[1]).toHaveLength(1);
    expect(explicitlyOverridden.emptyTableauPolicy).toBe('king-only');
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

  function almostWonState(): KlondikeState {
    const deck = createDeck('completion');
    return {
      gameId: 'klondike', drawCount: 3, completed: false, stock: [], waste: [],
      foundations: SUITS.map((suit) => deck.filter((current) => current.suit === suit && current.rank <= 11)),
      tableau: [
        ...SUITS.map((suit) => [
          { ...deck.find((current) => current.suit === suit && current.rank === 13)!, faceUp: true },
          { ...deck.find((current) => current.suit === suit && current.rank === 12)!, faceUp: true },
        ]), [], [], [],
      ],
    };
  }

  it('recognizes a full-deck finish despite legal foundation withdrawals', () => {
    const state = almostWonState();
    const before = structuredClone(state);
    expect(getLegalMoves(state).some((move) => move.kind === 'move' && move.source.zone === 'foundation')).toBe(true);
    expect(canAutoComplete(state)).toBe(true);
    expect(state).toEqual(before);
  });

  it('requires automatic promotions to finish the entire game', () => {
    const state = almostWonState();
    state.tableau[0].reverse();
    expect(canAutoComplete(state)).toBe(false);
    state.tableau[0] = [card('two-only', 'clubs', 2)];
    state.foundations = [[card('ace-only', 'clubs', 1)], [], [], []];
    expect(canAutoComplete(state)).toBe(false);
  });

  it('rejects completion while stock or hidden tableau cards remain', () => {
    const state = almostWonState();
    state.stock.push(state.tableau[0].pop()!);
    expect(canAutoComplete(state)).toBe(false);
    state.tableau[0].push({ ...state.stock.pop()!, faceUp: false });
    expect(canAutoComplete(state)).toBe(false);
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
