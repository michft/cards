import type { ClockState } from '@mumscards/game-clock';
import type { FreeCellState } from '@mumscards/game-freecell';
import type { FreeCellTableauBuildPolicy } from '@mumscards/game-freecell';
import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type {
  KlondikeDrawCount,
  KlondikeEmptyTableauPolicy,
  KlondikeHintMode,
  KlondikeState,
} from '@mumscards/game-klondike';
import type { PyramidState } from '@mumscards/game-pyramid';
import type { SpiderState, SpiderSuitMode } from '@mumscards/game-spider';

export type GameVariant = 'clock' | 'freecell' | 'klondike' | 'pyramid' | 'spider';

export type GameStateMap = {
  clock: ClockState;
  freecell: FreeCellState;
  klondike: KlondikeState;
  pyramid: PyramidState;
  spider: SpiderState;
};

export type SavedStateSnapshot<TState extends object> = PersistedGameEnvelope<TState> & {
  id: string;
  label: string;
};

export type AppSettings = {
  drawCount: KlondikeDrawCount;
  hintMode: KlondikeHintMode;
  emptyTableauPolicy: KlondikeEmptyTableauPolicy;
  spiderSuitMode: SpiderSuitMode;
  freeCellTableauBuildPolicy: FreeCellTableauBuildPolicy;
  klondikeDebugTools: boolean;
  spiderDebugTools: boolean;
  freeCellDebugTools: boolean;
  pyramidDebugTools: boolean;
  clockDebugTools: boolean;
};

export type SavedGames = {
  [Variant in GameVariant]: PersistedGameEnvelope<GameStateMap[Variant]> | null;
};

export type SavedSnapshots = {
  [Variant in GameVariant]: SavedStateSnapshot<GameStateMap[Variant]>[];
};

export const defaultSettings: AppSettings = {
  drawCount: 3,
  hintMode: 'balanced',
  emptyTableauPolicy: 'any',
  spiderSuitMode: 'red-black',
  freeCellTableauBuildPolicy: 'alternate-red-black',
  klondikeDebugTools: false,
  spiderDebugTools: false,
  freeCellDebugTools: false,
  pyramidDebugTools: false,
  clockDebugTools: false,
};

export const defaultSavedGames: SavedGames = {
  clock: null,
  freecell: null,
  klondike: null,
  pyramid: null,
  spider: null,
};

export const defaultSavedSnapshots: SavedSnapshots = {
  clock: [],
  freecell: [],
  klondike: [],
  pyramid: [],
  spider: [],
};
