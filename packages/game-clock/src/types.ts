import type { PlayingCard } from '@mumscards/engine-core';

export type ClockGameId = 'clock';

export type ClockState = {
  gameId: ClockGameId;
  hours: PlayingCard[][];
  stockPiles: PlayingCard[][];
  stock?: PlayingCard[];
  activeCard: PlayingCard | null;
  activeSource:
    | {
        zone: 'stock';
        pileIndex: number;
      }
    | {
        zone: 'hour';
        hourIndex: number;
      }
    | null;
  activeStockPileIndex: number | null;
  completedStockPiles: number[];
  kings: PlayingCard[];
  returnedKingIds: string[];
  placedCardIds: string[];
  won: boolean;
  lost: boolean;
};
