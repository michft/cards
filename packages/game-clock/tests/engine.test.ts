import { describe, expect, it } from 'vitest';

import { createClockGame, drawClockStock, placeClockActiveCard } from '../src/engine';
import type { ClockState } from '../src/types';

describe('createClockGame', () => {
  it('deals 12 piles of 4 cards with a 4-card stock', () => {
    const state = createClockGame(() => 0.5);
    const count = state.hours.reduce((sum, pile) => sum + pile.length, 0) + state.stock.length;

    expect(state.hours).toHaveLength(12);
    expect(state.hours.every((pile) => pile.length === 4)).toBe(true);
    expect(state.stock).toHaveLength(4);
    expect(count).toBe(52);
  });
});

describe('clock moves', () => {
  it('draws one card from stock to active card', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stock: [{ id: 'a', suit: 'spades', rank: 1, color: 'black' }],
      activeCard: null,
      kings: [],
      won: false,
    };

    const next = drawClockStock(state);
    expect(next.stock).toHaveLength(0);
    expect(next.activeCard?.id).toBe('a');
  });

  it('places active card then reveals from target hour pile', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stock: [],
      activeCard: { id: 'active-3', suit: 'hearts', rank: 3, color: 'red' },
      kings: [],
      won: false,
    };
    state.hours[2] = [{ id: 'hidden', suit: 'clubs', rank: 9, color: 'black' }];

    const next = placeClockActiveCard(state);

    expect(next.activeCard?.id).toBe('hidden');
    expect(next.hours[2].map((card) => card.id)).toEqual(['active-3']);
  });

  it('routes kings to the king pile', () => {
    const state: ClockState = {
      gameId: 'clock',
      hours: Array.from({ length: 12 }, () => []),
      stock: [],
      activeCard: { id: 'k', suit: 'spades', rank: 13, color: 'black' },
      kings: [],
      won: false,
    };

    const next = placeClockActiveCard(state);
    expect(next.kings).toHaveLength(1);
    expect(next.activeCard).toBeNull();
  });
});
