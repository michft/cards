import { describe, expect, it } from 'vitest';

import { createClockGame, drawClockStock, placeClockActiveCard, normalizeClockState } from '../src/engine';
import type { ClockState } from '../src/types';

describe('createClockGame', () => {
  it('deals 12 piles of 4 cards with 4 single stock piles', () => {
    const state = createClockGame(() => 0.5);
    const count = state.hours.reduce((sum, pile) => sum + pile.length, 0)
      + state.stockPiles.reduce((sum, pile) => sum + pile.length, 0);

    expect(state.hours).toHaveLength(12);
    expect(state.hours.every((pile) => pile.length === 4)).toBe(true);
    expect(state.stockPiles).toHaveLength(4);
    expect(state.stockPiles.every((pile) => pile.length === 1)).toBe(true);
    expect(count).toBe(52);
  });
});

describe('clock moves', () => {
  it('resolves a complete dealt game with a King initially in stock', () => {
    let seed = 2;
    let state = createClockGame(() => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });
    const kingPileIndex = state.stockPiles.findIndex((pile) => pile[0]?.rank === 13);
    expect(kingPileIndex).toBeGreaterThanOrEqual(0);

    const drawnKing = drawClockStock(state, kingPileIndex);
    expect(drawnKing.activeCard?.rank).toBe(13);
    const returnedKing = placeClockActiveCard(drawnKing);
    expect(returnedKing.completedStockPiles).toContain(kingPileIndex);
    expect(drawClockStock(returnedKing, kingPileIndex)).toBe(returnedKing);

    state = returnedKing;
    for (let move = 0; move < 60 && !state.won && !state.lost; move += 1) {
      const next = state.activeCard
        ? placeClockActiveCard(state)
        : state.stockPiles.reduce(
            (candidate, _, pileIndex) => candidate === state
              ? drawClockStock(state, pileIndex)
              : candidate,
            state,
          );
      if (next === state) {
        break;
      }
      state = next;
    }

    expect(state.won || state.lost).toBe(true);
    expect(state.returnedKingIds).toHaveLength(4);
  });

  it('draws one card from stock to active card', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stockPiles: [[{ id: 'a', suit: 'spades', rank: 1, color: 'black' }], [], [], []],
      stock: [],
      activeCard: null,
      activeSource: null,
      activeStockPileIndex: null,
      completedStockPiles: [],
      kings: [],
      returnedKingIds: [],
      placedCardIds: [],
      won: false,
      lost: false,
    };

    const next = drawClockStock(state, 0);
    expect(next.stockPiles[0]).toHaveLength(0);
    expect(next.activeCard?.id).toBe('a');
    expect(next.activeSource).toEqual({ zone: 'stock', pileIndex: 0 });
    expect(next.activeStockPileIndex).toBe(0);
  });

  it('places active card then reveals from target hour pile', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stockPiles: [[], [], [], []],
      stock: [],
      activeCard: { id: 'active-3', suit: 'hearts', rank: 3, color: 'red' },
      activeSource: { zone: 'stock', pileIndex: 0 },
      activeStockPileIndex: 0,
      completedStockPiles: [],
      kings: [],
      returnedKingIds: [],
      placedCardIds: [],
      won: false,
      lost: false,
    };
    state.hours[3] = [{ id: 'hidden', suit: 'clubs', rank: 9, color: 'black' }];

    const next = placeClockActiveCard(state);

    expect(next.activeCard?.id).toBe('hidden');
    expect(next.activeSource).toEqual({ zone: 'hour', hourIndex: 3 });
    expect(next.hours[3].map((card) => card.id)).toEqual(['active-3']);
    expect(next.placedCardIds).toContain('active-3');
  });

  it('returns Kings to the stock pile that started their chain', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stockPiles: [[], [], [], []],
      stock: [],
      activeCard: { id: 'k', suit: 'spades', rank: 13, color: 'black' },
      activeSource: { zone: 'stock', pileIndex: 2 },
      activeStockPileIndex: 2,
      completedStockPiles: [],
      kings: [],
      returnedKingIds: [],
      placedCardIds: [],
      won: false,
      lost: false,
    };

    const next = placeClockActiveCard(state);
    expect(next.kings).toHaveLength(1);
    expect(next.activeCard).toBeNull();
    expect(next.activeSource).toBeNull();
    expect(next.stockPiles[2].map((card) => card.id)).toEqual(['k']);
    expect(next.completedStockPiles).toContain(2);
    expect(next.returnedKingIds).toContain('k');
    expect(next.placedCardIds).toContain('k');
  });

  it('marks game as lost when all 4 kings are found with unrevealed cards remaining', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: [
        [{ id: 'hidden', suit: 'spades', rank: 2, color: 'black' }],
        ...Array.from({ length: 11 }, () => []),
      ],
      stockPiles: [[], [], [], []],
      stock: [],
      activeCard: { id: 'k4', suit: 'hearts', rank: 13, color: 'red' },
      activeSource: { zone: 'stock', pileIndex: 3 },
      activeStockPileIndex: 3,
      completedStockPiles: [0, 1, 2],
      kings: [
        { id: 'k1', suit: 'clubs', rank: 13, color: 'black' },
        { id: 'k2', suit: 'diamonds', rank: 13, color: 'red' },
        { id: 'k3', suit: 'spades', rank: 13, color: 'black' },
      ],
      returnedKingIds: ['k1', 'k2', 'k3'],
      placedCardIds: ['k1', 'k2', 'k3'],
      won: false,
      lost: false,
    };

    const next = placeClockActiveCard(state);
    expect(next.kings).toHaveLength(4);
    expect(next.won).toBe(false);
    expect(next.lost).toBe(true);
  });
});

describe('legacy Clock continuation', () => {
  function activeKingState(): ClockState {
    let seed = 2;
    const dealt = createClockGame(() => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 2 ** 32;
    });
    const kingPileIndex = dealt.stockPiles.findIndex((pile) => pile[0]?.rank === 13);
    [dealt.stockPiles[2], dealt.stockPiles[kingPileIndex]] = [dealt.stockPiles[kingPileIndex], dealt.stockPiles[2]];
    return { ...drawClockStock(dealt, 2), activeStockPileIndex: null };
  }

  it('recovers the active stock source when the chain index is absent', () => {
    const state = activeKingState();
    const before = structuredClone(state);
    const next = placeClockActiveCard(state);
    expect(next.activeCard).toBeNull();
    expect(next.stockPiles[2]).toEqual([state.activeCard]);
    expect(next.completedStockPiles).toContain(2);
    expect(state).toEqual(before);
  });

  it('recovers a chain revealed from an hour using its unique vacant stock pile', () => {
    const state = activeKingState();
    state.activeSource = { zone: 'hour', hourIndex: 5 };
    expect(placeClockActiveCard(state).stockPiles[2]).toEqual([state.activeCard]);
  });

  it('does not guess an origin when modern stock piles have multiple vacant chains', () => {
    const state = activeKingState();
    state.stockPiles[1] = [];
    state.activeSource = { zone: 'hour', hourIndex: 5 };
    expect(normalizeClockState(state).activeStockPileIndex).toBeNull();
    expect(placeClockActiveCard(state)).toBe(state);
  });

  it('migrates old flat stock, hour order and found Kings without losing physical cards', () => {
    const dealt = createClockGame(() => 0.5);
    const allCards = [...dealt.hours.flat(), ...dealt.stockPiles.flat()];
    const kings = allCards.filter((card) => card.rank === 13);
    const remaining = allCards.filter((card) => card.rank !== 13);
    const oldHours = Array.from({ length: 12 }, () => [] as typeof allCards);
    [...remaining.slice(2), ...kings.slice(2)].forEach((card, index) => oldHours[index % 12].push(card));
    const legacy = {
      gameId: 'clock', hours: oldHours, stock: [remaining[0], remaining[1]],
      activeCard: kings[1], kings: [kings[0]], won: false,
    } as ClockState;
    const before = structuredClone(legacy);
    const normalized = normalizeClockState(legacy);
    const next = placeClockActiveCard(legacy);
    expect(normalized.hours[1]).toEqual(oldHours[0]);
    expect(normalized.hours[0]).toEqual(oldHours[11]);
    expect(normalized.stockPiles.map((pile) => pile.map((card) => card.id)))
      .toEqual([[remaining[1].id], [remaining[0].id], [kings[0].id], []]);
    expect(next.stockPiles[3]).toEqual([kings[1]]);
    expect(next.completedStockPiles).toEqual([2, 3]);
    const ids = [...next.hours.flat(), ...next.stockPiles.flat()].map((card) => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual([...oldHours.flat(), ...legacy.stock!, ...legacy.kings, legacy.activeCard!].map((card) => card.id).sort());
    expect(legacy).toEqual(before);
    expect(normalizeClockState(normalized)).toEqual(normalized);
  });
});
