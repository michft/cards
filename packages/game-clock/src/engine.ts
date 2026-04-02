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

  return {
    gameId: 'clock',
    hours,
    stock: deck,
    activeCard: null,
    kings: [],
    won: false,
  };
}

export function drawClockStock(state: ClockState): ClockState {
  if (state.activeCard || state.stock.length === 0 || state.won) {
    return state;
  }

  const next = cloneState(state);
  const card = next.stock.pop();

  if (!card) {
    return state;
  }

  next.activeCard = card;
  return withWinState(next);
}

export function placeClockActiveCard(state: ClockState): ClockState {
  if (!state.activeCard || state.won) {
    return state;
  }

  const next = cloneState(state);
  const active = next.activeCard;

  if (!active) {
    return state;
  }

  next.activeCard = null;

  if (active.rank === 13) {
    next.kings.push(active);
    return withWinState(next);
  }

  const pileIndex = active.rank - 1;
  const destination = next.hours[pileIndex];

  destination.unshift(active);

  if (destination.length > 1) {
    const revealed = destination.pop();

    if (revealed) {
      next.activeCard = revealed;
    }
  }

  return withWinState(next);
}

function withWinState(state: ClockState): ClockState {
  const allPlaced = state.stock.length === 0 && state.activeCard === null;
  const allKingsFound = state.kings.length === 4;

  if (!allPlaced || !allKingsFound) {
    return state;
  }

  return {
    ...state,
    won: true,
  };
}

function cloneState(state: ClockState): ClockState {
  return {
    ...state,
    hours: state.hours.map((pile) => pile.map((card) => ({ ...card }))),
    stock: state.stock.map((card) => ({ ...card })),
    activeCard: state.activeCard ? { ...state.activeCard } : null,
    kings: state.kings.map((card) => ({ ...card })),
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}
