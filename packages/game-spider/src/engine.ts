import { createDeck } from '@mumscards/engine-core';
import type { PlayingCard } from '@mumscards/engine-core';

import type { SpiderState, SpiderSuitMode, SpiderTableauCard } from './types';

type SpiderOptions = {
  suitMode?: SpiderSuitMode;
};

export function createSpiderGame(random = Math.random, options?: SpiderOptions): SpiderState {
  const suitMode = options?.suitMode ?? 'red-black';
  const deck = shuffle(createSpiderDeck(suitMode), random);
  const tableau: SpiderTableauCard[][] = Array.from({ length: 10 }, (_, pileIndex) => {
    const pileSize = pileIndex < 4 ? 6 : 5;
    const pile: SpiderTableauCard[] = [];

    for (let index = 0; index < pileSize; index += 1) {
      const card = deck.pop();

      if (!card) {
        throw new Error('Deck exhausted while dealing Spider tableau.');
      }

      pile.push({
        ...card,
        faceUp: index === pileSize - 1,
      });
    }

    return pile;
  });

  return {
    gameId: 'spider',
    suitMode,
    completedRuns: 0,
    foundations: [],
    stock: deck,
    tableau,
  };
}

function createSpiderDeck(suitMode: SpiderSuitMode): PlayingCard[] {
  const base = createDeck('spider-base');
  const filtered = getSpiderSuitCards(base, suitMode);
  const repeats = getSpiderRepeats(suitMode);
  const deck: PlayingCard[] = [];

  for (let setIndex = 0; setIndex < repeats; setIndex += 1) {
    for (const card of filtered) {
      deck.push({
        ...card,
        id: `spider-${suitMode}-${setIndex}-${card.suit}-${card.rank}`,
      });
    }
  }

  return deck;
}

function getSpiderSuitCards(base: PlayingCard[], suitMode: SpiderSuitMode): PlayingCard[] {
  if (suitMode === 'spades-only') {
    return base.filter((card) => card.suit === 'spades');
  }

  if (suitMode === 'hearts-only') {
    return base.filter((card) => card.suit === 'hearts');
  }

  if (suitMode === 'red-black') {
    return base.filter((card) => card.suit === 'hearts' || card.suit === 'spades');
  }

  return base;
}

function getSpiderRepeats(suitMode: SpiderSuitMode): number {
  if (suitMode === 'spades-only' || suitMode === 'hearts-only') {
    return 8;
  }

  if (suitMode === 'red-black') {
    return 4;
  }

  return 2;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const next = [...items];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}
