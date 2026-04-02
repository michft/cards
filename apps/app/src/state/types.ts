import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type { KlondikeHintMode, KlondikeState } from '@mumscards/game-klondike';

export type GameVariant = 'klondike';

export type AppSettings = {
  hintMode: KlondikeHintMode;
};

export type SavedGames = {
  klondike: PersistedGameEnvelope<KlondikeState> | null;
};

export const defaultSettings: AppSettings = {
  hintMode: 'balanced',
};

export const defaultSavedGames: SavedGames = {
  klondike: null,
};
