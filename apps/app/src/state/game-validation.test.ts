import { createClockGame } from '@mumscards/game-clock';
import { createFreeCellGame } from '@mumscards/game-freecell';
import { createKlondikeGame } from '@mumscards/game-klondike';
import { createPyramidGame } from '@mumscards/game-pyramid';
import { createSpiderGame } from '@mumscards/game-spider';
import { describe, expect, it } from 'vitest';

import { isGameState, parseGameEnvelope, parseSavedSnapshot } from './game-validation';
import type { GameVariant } from './types';

const initialStates = {
  clock: createClockGame(),
  freecell: createFreeCellGame(),
  klondike: createKlondikeGame(),
  pyramid: createPyramidGame(),
  spider: createSpiderGame(),
};
const variants = Object.keys(initialStates) as GameVariant[];
const envelope = (variant: GameVariant, state: unknown = initialStates[variant]) => ({
  gameId: variant, updatedAt: '2026-10-18T00:00:00.000Z', state,
});

describe('saved game validation', () => {
  it.each(variants)('accepts %s deals and rejects empty or mismatched states', (variant) => {
    expect(parseGameEnvelope(variant, envelope(variant))).not.toBeNull();
    for (const state of [{}, null, [], { ...initialStates[variant], gameId: 'unknown' }]) {
      expect(parseGameEnvelope(variant, envelope(variant, state))).toBeNull();
    }
  });

  it.each(variants)('rejects malformed %s history without losing its valid original deal', (variant) => {
    const saved = envelope(variant);
    const parsed = parseGameEnvelope(variant, {
      ...saved,
      history: { initial: saved.state, past: [{}, saved.state], future: [null, saved.state] },
    });
    expect(parsed?.history).toEqual({ initial: saved.state, past: [saved.state], future: [saved.state] });
    expect(parseGameEnvelope(variant, { ...saved, history: { initial: {}, past: [], future: [] } })?.history)
      .toBeUndefined();
  });

  it('rejects malformed cards, pile dimensions, outcomes, and rule values', () => {
    const state = createKlondikeGame();
    const card = state.stock[0];
    for (const invalidCard of [null, {}, { ...card, id: '' }, { ...card, rank: 14 },
      { ...card, rank: 1.5 }, { ...card, suit: 'joker' }, { ...card, color: 'green' },
      { ...card, color: card.color === 'red' ? 'black' : 'red' }]) {
      expect(isGameState('klondike', { ...state, stock: [invalidCard] })).toBe(false);
    }
    for (const patch of [{ tableau: [] }, { foundations: [[], [], []] }, { completed: 1 },
      { drawCount: 2 }, { emptyTableauPolicy: 'invalid' },
      { tableau: [[{ ...card, faceUp: 'yes' }], ...state.tableau.slice(1)] }]) {
      expect(isGameState('klondike', { ...state, ...patch })).toBe(false);
    }
  });

  it('accepts subset positions and absent legacy rule fields', () => {
    const klondike = createKlondikeGame();
    delete klondike.emptyTableauPolicy;
    expect(isGameState('klondike', { ...klondike, stock: [], waste: [],
      foundations: Array.from({ length: 4 }, () => []), tableau: Array.from({ length: 7 }, () => []) })).toBe(true);
    const freecell = createFreeCellGame();
    delete freecell.tableauBuildPolicy;
    expect(isGameState('freecell', freecell)).toBe(true);
    expect(isGameState('freecell', { ...freecell, tableauBuildPolicy: 'red-black' })).toBe(true);
  });

  it('checks each variant-specific shape and counter', () => {
    expect(isGameState('freecell', { ...initialStates.freecell, freeCells: [] })).toBe(false);
    expect(isGameState('freecell', { ...initialStates.freecell, tableau: [] })).toBe(false);
    expect(isGameState('freecell', { ...initialStates.freecell, won: null })).toBe(false);
    expect(isGameState('freecell', { ...initialStates.freecell, tableauBuildPolicy: 'invalid' })).toBe(false);
    expect(isGameState('spider', { ...initialStates.spider, suitMode: 'invalid' })).toBe(false);
    expect(isGameState('spider', { ...initialStates.spider, tableau: [] })).toBe(false);
    expect(isGameState('spider', { ...initialStates.spider, foundations: Array.from({ length: 9 }, () => []) })).toBe(false);
    expect(isGameState('spider', { ...initialStates.spider, completedRuns: -1 })).toBe(false);
    expect(isGameState('pyramid', { ...initialStates.pyramid, tableau: Array.from({ length: 7 }, () => []) })).toBe(false);
    expect(isGameState('pyramid', { ...initialStates.pyramid, removedCount: 53 })).toBe(false);
    expect(isGameState('pyramid', { ...initialStates.pyramid, recyclesUsed: 0.5 })).toBe(false);
    expect(isGameState('pyramid', { ...initialStates.pyramid, maxRecycles: -1 })).toBe(false);
  });

  it('checks Clock indexes and accepts legacy flat stock and absent tracking fields', () => {
    const state = createClockGame();
    for (const patch of [{ hours: [] }, { stockPiles: [[], []] }, { activeStockPileIndex: 4 },
      { activeSource: { zone: 'hour', hourIndex: 12 } },
      { activeSource: { zone: 'stock', pileIndex: -1 } },
      { completedStockPiles: [0, 4] }, { returnedKingIds: [null] }, { placedCardIds: [5] }]) {
      expect(isGameState('clock', { ...state, ...patch })).toBe(false);
    }
    const legacy: Record<string, unknown> = { ...state, stock: state.stockPiles.flat() };
    for (const key of ['stockPiles', 'activeStockPileIndex', 'completedStockPiles',
      'returnedKingIds', 'placedCardIds', 'lost']) delete legacy[key];
    const parsed = parseGameEnvelope('clock', envelope('clock', legacy));
    expect(parsed?.state.stockPiles).toHaveLength(4);
    expect(Array.isArray(parsed?.state.placedCardIds)).toBe(true);
    expect(parseGameEnvelope('clock', envelope('clock', { ...legacy,
      stock: [...state.stockPiles.flat(), state.hours[0][0]] }))).toBeNull();
    expect(parseGameEnvelope('clock', envelope('clock', { ...legacy,
      kings: [state.hours[0][0]] }))).toBeNull();
  });

  it('requires matching envelope and snapshot metadata', () => {
    expect(parseGameEnvelope('clock', { ...envelope('clock'), gameId: 'freecell' })).toBeNull();
    expect(parseGameEnvelope('clock', { ...envelope('clock'), updatedAt: null })).toBeNull();
    expect(parseSavedSnapshot('clock', { ...envelope('clock'), id: 'saved', label: 'Position' }))
      .toMatchObject({ id: 'saved', label: 'Position' });
    expect(parseSavedSnapshot('clock', { ...envelope('clock'), id: 5, label: 'Position' })).toBeNull();
  });

  it('normalizes legacy Clock positions throughout history and rejects an unrecoverable chain', () => {
    const state = createClockGame();
    const activeCard = state.stockPiles[0][0];
    const recoverable = { ...state, stockPiles: [[], ...state.stockPiles.slice(1)], activeCard,
      activeSource: { zone: 'stock', pileIndex: 0 }, activeStockPileIndex: null };
    const parsed = parseGameEnvelope('clock', { ...envelope('clock', recoverable),
      history: { initial: state, past: [recoverable], future: [] } });
    expect(parsed?.state.activeStockPileIndex).toBe(0);
    expect(parsed?.history?.past[0].activeStockPileIndex).toBe(0);
    expect(parseGameEnvelope('clock', envelope('clock', { ...state, activeCard, activeSource: null }))).toBeNull();
  });

  it('retains a valid original deal when history lists themselves are malformed', () => {
    const state = initialStates.freecell;
    expect(parseGameEnvelope('freecell', { ...envelope('freecell'),
      history: { initial: state, past: null, future: {} } })?.history)
      .toEqual({ initial: state, past: [], future: [] });
  });
});
