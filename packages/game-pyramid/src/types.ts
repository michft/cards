import type { PlayingCard } from '@mumscards/engine-core';

export type PyramidGameId = 'pyramid';

export type PyramidTableau = Array<Array<PlayingCard | null>>;

export type PyramidState = {
  gameId: PyramidGameId;
  tableau: PyramidTableau;
  stock: PlayingCard[];
  waste: PlayingCard[];
  removedCount: number;
  recyclesUsed: number;
  maxRecycles: number;
  won: boolean;
};

export type PyramidSource =
  | {
      zone: 'tableau';
      rowIndex: number;
      cardIndex: number;
    }
  | {
      zone: 'waste';
    };
