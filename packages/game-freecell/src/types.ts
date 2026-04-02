import type { PlayingCard } from '@mumscards/engine-core';

export type FreeCellGameId = 'freecell';

export type FreeCellTableauBuildPolicy =
  | 'any'
  | 'red-black'
  | 'alternate-red-black'
  | 'suit-matching';

export type FreeCellState = {
  gameId: FreeCellGameId;
  foundations: PlayingCard[][];
  freeCells: Array<PlayingCard | null>;
  tableau: PlayingCard[][];
  won: boolean;
};

export type FreeCellSource =
  | {
      zone: 'tableau';
      pileIndex: number;
      cardIndex: number;
    }
  | {
      zone: 'cell';
      cellIndex: number;
    };

export type FreeCellDestination =
  | {
      zone: 'tableau';
      pileIndex: number;
    }
  | {
      zone: 'cell';
      cellIndex: number;
    }
  | {
      zone: 'foundation';
      pileIndex: number;
    };
