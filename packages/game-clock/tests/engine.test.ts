import { describe, expect, it } from 'vitest';

import { createClockGame, drawClockStock, placeClockActiveCard } from '../src/engine';
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

  it('routes kings to the king pile', () => {
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
