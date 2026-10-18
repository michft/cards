import { createDeck } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';

import type { ClockState } from './types';

export function createClockGame(random = Math.random): ClockState {
  const deck = shuffle(createDeck('clock'), random);
  const hours: PlayingCard[][] = Array.from({ length: 12 }, () => []);

  for (let row = 0; row < 4; row += 1) {
    for (let hour = 0; hour < 12; hour += 1) {
      const card = deck.pop();

      if (!card) {
        throw new Error('Deck exhausted while dealing Clock layout.');
      }

      hours[hour].push(card);
    }
  }

  const stockPiles = [[], [], [], []] as PlayingCard[][];

  for (let pileIndex = 0; pileIndex < 4; pileIndex += 1) {
    const card = deck.pop();

    if (!card) {
      throw new Error('Deck exhausted while dealing Clock stock piles.');
    }

    stockPiles[pileIndex].push(card);
  }

  return {
    gameId: 'clock',
    hours,
    stockPiles,
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
}

export function drawClockStock(state: ClockState, pileIndex: number): ClockState {
  const normalized = normalizeClockState(state);

  if (normalized.activeCard || normalized.won || normalized.lost) {
    return state;
  }

  if (pileIndex < 0 || pileIndex >= normalized.stockPiles.length) {
    return state;
  }

  if (normalized.completedStockPiles.includes(pileIndex)) {
    return state;
  }

  const next = cloneState(normalized);
  const sourcePile = next.stockPiles[pileIndex];
  const top = sourcePile[sourcePile.length - 1];

  if (!top) {
    return state;
  }

  const card = sourcePile.pop();

  if (!card) {
    return state;
  }

  next.activeCard = card;
  next.activeSource = { zone: 'stock', pileIndex };
  next.activeStockPileIndex = pileIndex;
  return withOutcomeState(next);
}

export function placeClockActiveCard(state: ClockState): ClockState {
  const normalized = normalizeClockState(state);

  if (!normalized.activeCard || normalized.won || normalized.lost) {
    return state;
  }

  const next = cloneState(normalized);
  const active = next.activeCard;

  if (!active) {
    return state;
  }

  next.activeCard = null;
  next.activeSource = null;

  if (active.rank === 13) {
    if (next.activeStockPileIndex === null) {
      return state;
    }

    const originPile = next.stockPiles[next.activeStockPileIndex];
    originPile.push(active);
    if (!next.completedStockPiles.includes(next.activeStockPileIndex)) {
      next.completedStockPiles.push(next.activeStockPileIndex);
    }
    next.kings.push(active);
    next.returnedKingIds = [...next.returnedKingIds, active.id];
    next.placedCardIds = [...(next.placedCardIds ?? []), active.id];
    next.activeStockPileIndex = null;
    return withOutcomeState(next);
  }

  const pileIndex = getHourIndexForRank(active.rank);
  const destination = next.hours[pileIndex];

  destination.unshift(active);
  next.placedCardIds = [...(next.placedCardIds ?? []), active.id];

  if (destination.length > 1) {
    const revealed = destination.pop();

    if (revealed) {
      next.activeCard = revealed;
      next.activeSource = { zone: 'hour', hourIndex: pileIndex };
    }
  }

  return withOutcomeState(next);
}

function withOutcomeState(state: ClockState): ClockState {
  const allChainsCompleted = state.completedStockPiles.length === 4;
  const allKingsFound = state.kings.length === 4 && state.returnedKingIds.length === 4;
  const noActive = state.activeCard === null;
  const unrevealedCardsRemain = state.hours.some((pile) =>
    pile.some((card) => !state.placedCardIds.includes(card.id)),
  );

  if (allKingsFound && noActive && unrevealedCardsRemain) {
    return {
      ...state,
      won: false,
      lost: true,
    };
  }

  if (allChainsCompleted && allKingsFound && noActive && !unrevealedCardsRemain) {
    return {
      ...state,
      won: true,
      lost: false,
    };
  }

  return {
    ...state,
    won: false,
    lost: false,
  };
}

function cloneState(state: ClockState): ClockState {
  return {
    ...state,
    hours: state.hours.map((pile) => pile.map((card) => ({ ...card }))),
    stockPiles: state.stockPiles.map((pile) => pile.map((card) => ({ ...card }))),
    stock: state.stock ? state.stock.map((card) => ({ ...card })) : [],
    activeCard: state.activeCard ? { ...state.activeCard } : null,
    activeSource: state.activeSource ? { ...state.activeSource } : null,
    activeStockPileIndex: state.activeStockPileIndex ?? null,
    completedStockPiles: [...(state.completedStockPiles ?? [])],
    kings: state.kings.map((card) => ({ ...card })),
    returnedKingIds: [...(state.returnedKingIds ?? [])],
    placedCardIds: [...(state.placedCardIds ?? [])],
    lost: state.lost ?? false,
  };
}

function getHourIndexForRank(rank: number): number {
  if (rank === 12) {
    return 0;
  }

  return rank;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

/** Normalize persisted Clock layouts without mutating the saved position. */
export function normalizeClockState(state: ClockState): ClockState {
  if (state.stockPiles && state.stockPiles.length === 4) {
    const completedStockPiles = state.completedStockPiles ?? [];
    let activeStockPileIndex = state.activeStockPileIndex ?? null;

    if (state.activeCard && activeStockPileIndex === null) {
      const vacant = state.stockPiles.flatMap((pile, index) =>
        pile.length === 0 && !completedStockPiles.includes(index) ? [index] : [],
      );
      const source = state.activeSource;
      if (source?.zone === 'stock' && vacant.includes(source.pileIndex)) {
        activeStockPileIndex = source.pileIndex;
      } else if (vacant.length === 1) {
        activeStockPileIndex = vacant[0];
      }
    }

    return {
      ...state,
      activeSource: state.activeSource ?? null,
      activeStockPileIndex,
      completedStockPiles,
      returnedKingIds: state.returnedKingIds ?? [],
      placedCardIds: state.placedCardIds ?? [],
      lost: state.lost ?? false,
    };
  }

  // Original saves used a flat stock and stored found Kings separately. They did
  // not record chain origins, so assign completed/active chains vacant slots.
  const legacyStock = state.stock ?? [];
  const stockPiles = [0, 1, 2, 3].map((index) => {
    const card = legacyStock[legacyStock.length - 1 - index];
    return card ? [{ ...card }] : [];
  });
  const completedStockPiles = state.kings.map((king, index) => {
    const pileIndex = legacyStock.length + index;
    if (stockPiles[pileIndex]) stockPiles[pileIndex].push({ ...king });
    return pileIndex;
  });
  const activeStockPileIndex = state.activeCard
    ? stockPiles.findIndex((pile, index) => pile.length === 0 && !completedStockPiles.includes(index))
    : -1;
  // Original hours were Ace-first; current hours are clock order (Queen first).
  const hours = [state.hours[11], ...state.hours.slice(0, 11)];
  const placedCardIds = state.placedCardIds ?? hours.flatMap((pile, hourIndex) => {
    const rank = hourIndex === 0 ? 12 : hourIndex;
    const firstHidden = pile.findIndex((card) => card.rank !== rank);
    return pile.slice(0, firstHidden < 0 ? pile.length : firstHidden).map((card) => card.id);
  });

  return {
    ...state,
    hours,
    stockPiles,
    stock: [],
    activeSource: state.activeSource ?? null,
    activeStockPileIndex: activeStockPileIndex < 0 ? null : activeStockPileIndex,
    completedStockPiles,
    returnedKingIds: state.kings.map((king) => king.id),
    placedCardIds: [...new Set([...placedCardIds, ...state.kings.map((king) => king.id)])],
    lost: state.lost ?? false,
  };
}
