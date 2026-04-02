import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type {
  KlondikeDrawCount,
  KlondikeEmptyTableauPolicy,
  KlondikeHintMode,
  KlondikeState,
} from '@mumscards/game-klondike';
import type { SpiderState, SpiderSuitMode } from '@mumscards/game-spider';

export type GameVariant = 'klondike' | 'spider';

export type GameStateMap = {
  klondike: KlondikeState;
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
};

export const defaultSavedGames: SavedGames = {
  klondike: null,
  spider: null,
};

export const defaultSavedSnapshots: SavedSnapshots = {
  klondike: [],
  spider: [],
};
