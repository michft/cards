import type { PlayingCard } from '@mumscards/engine-core';

export type KlondikeGameId = 'klondike';

export type KlondikeHintMode = 'balanced' | 'mobility' | 'foundation-first';

export type KlondikeTableauCard = PlayingCard & {
  faceUp: boolean;
};

export type KlondikeSource =
  | { zone: 'waste' }
  | { zone: 'foundation'; pileIndex: number }
  | { zone: 'tableau'; pileIndex: number; cardIndex: number };

export type KlondikeDestination =
  | { zone: 'foundation'; pileIndex: number }
  | { zone: 'tableau'; pileIndex: number };

export type KlondikeMove =
  | { kind: 'draw' }
  | { kind: 'recycle' }
  | { kind: 'move'; source: KlondikeSource; destination: KlondikeDestination };

export type KlondikeHint = {
  move: KlondikeMove;
  label: string;
};

export type KlondikeState = {
  gameId: KlondikeGameId;
  drawCount: 3;
  completed: boolean;
  stock: PlayingCard[];
  waste: PlayingCard[];
  foundations: PlayingCard[][];
  tableau: KlondikeTableauCard[][];
};
