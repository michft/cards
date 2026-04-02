import { describe, expect, it } from 'vitest';

import { createSpiderGame } from '../src/engine';

describe('Spider engine', () => {
  it('creates only spades in black-only mode', () => {
    const game = createSpiderGame(() => 0.5, { suitMode: 'spades-only' });
    const cards = [...game.stock, ...game.tableau.flat()];
    const suits = new Set(cards.map((card) => card.suit));

    expect(cards).toHaveLength(104);
    expect([...suits].sort()).toEqual(['spades']);
    expect(game.suitMode).toBe('spades-only');
  });

  it('creates only hearts in red-only mode', () => {
    const game = createSpiderGame(() => 0.5, { suitMode: 'hearts-only' });
    const cards = [...game.stock, ...game.tableau.flat()];
    const suits = new Set(cards.map((card) => card.suit));

    expect(cards).toHaveLength(104);
    expect([...suits].sort()).toEqual(['hearts']);
    expect(game.suitMode).toBe('hearts-only');
  });

  it('creates hearts and spades in red-black mode', () => {
    const game = createSpiderGame(() => 0.5, { suitMode: 'red-black' });
    const cards = [...game.stock, ...game.tableau.flat()];
    const suits = new Set(cards.map((card) => card.suit));

    expect(cards).toHaveLength(104);
    expect([...suits].sort()).toEqual(['hearts', 'spades']);
    expect(game.suitMode).toBe('red-black');
  });

  it('creates all four suits in all-suits mode', () => {
    const game = createSpiderGame(() => 0.5, { suitMode: 'all-suits' });
    const cards = [...game.stock, ...game.tableau.flat()];
    const suits = new Set(cards.map((card) => card.suit));

    expect(cards).toHaveLength(104);
    expect([...suits].sort()).toEqual(['clubs', 'diamonds', 'hearts', 'spades']);
    expect(game.suitMode).toBe('all-suits');
  });
});
