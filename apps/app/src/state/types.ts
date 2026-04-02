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

export type GameVariant = 'freecell' | 'klondike' | 'pyramid' | 'spider';

export type GameStateMap = {
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
};

export const defaultSavedGames: SavedGames = {
  freecell: null,
  klondike: null,
  pyramid: null,
  spider: null,
};

export const defaultSavedSnapshots: SavedSnapshots = {
  freecell: [],
  klondike: [],
  pyramid: [],
  spider: [],
};
