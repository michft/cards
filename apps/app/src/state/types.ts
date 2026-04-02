import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type {
  KlondikeDrawCount,
  KlondikeEmptyTableauPolicy,
  KlondikeHintMode,
  KlondikeState,
} from '@mumscards/game-klondike';

export type GameVariant = 'klondike';

export type AppSettings = {
  drawCount: KlondikeDrawCount;
  hintMode: KlondikeHintMode;
  emptyTableauPolicy: KlondikeEmptyTableauPolicy;
};

export type SavedGames = {
  klondike: PersistedGameEnvelope<KlondikeState> | null;
};

export const defaultSettings: AppSettings = {
  drawCount: 3,
  hintMode: 'balanced',
  emptyTableauPolicy: 'any',
};

export const defaultSavedGames: SavedGames = {
  klondike: null,
};
