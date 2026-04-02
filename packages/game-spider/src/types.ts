import type { PlayingCard } from '@mumscards/engine-core';

export type SpiderGameId = 'spider';

export type SpiderSuitMode =
  | 'spades-only'
  | 'hearts-only'
  | 'red-black'
  | 'all-suits';

export type SpiderTableauCard = PlayingCard & {
  faceUp: boolean;
};

export type SpiderState = {
  gameId: SpiderGameId;
  suitMode: SpiderSuitMode;
  completedRuns: number;
  foundations: PlayingCard[][];
  stock: PlayingCard[];
  tableau: SpiderTableauCard[][];
};
