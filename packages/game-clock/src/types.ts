import type { PlayingCard } from '@mumscards/engine-core';

export type ClockGameId = 'clock';

export type ClockState = {
  gameId: ClockGameId;
  hours: PlayingCard[][];
  stock: PlayingCard[];
  activeCard: PlayingCard | null;
  kings: PlayingCard[];
  won: boolean;
};
