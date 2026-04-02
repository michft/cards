import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type { KlondikeState } from '@mumscards/game-klondike';
import { loadJson, saveJson } from '@mumscards/storage';
import { useEffect, useSyncExternalStore } from 'react';

import {
  defaultSavedGames,
  defaultSettings,
  type AppSettings,
  type GameVariant,
  type SavedGames,
} from './types';
import { storageAdapter } from './storage-adapter';

const SETTINGS_KEY = 'mumscards.settings';
const SAVES_KEY = 'mumscards.saves';

type AppSnapshot = {
  hydrated: boolean;
  settings: AppSettings;
  saves: SavedGames;
};

type AppModelValue = AppSnapshot & {
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  saveGame(
    variant: GameVariant,
    envelope: PersistedGameEnvelope<KlondikeState>,
  ): Promise<void>;
  clearGame(variant: GameVariant): Promise<void>;
};

let snapshot: AppSnapshot = {
  hydrated: false,
  settings: defaultSettings,
  saves: defaultSavedGames,
};

let hydratePromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: AppSnapshot) {
  snapshot = next;
  emit();
}

async function ensureHydrated() {
  if (snapshot.hydrated) {
    return;
  }

  if (!hydratePromise) {
    hydratePromise = (async () => {
      const [loadedSettings, loadedSaves] = await Promise.all([
        loadJson(storageAdapter, SETTINGS_KEY, defaultSettings),
        loadJson(storageAdapter, SAVES_KEY, defaultSavedGames),
      ]);

      setSnapshot({
        hydrated: true,
        settings: {
          ...defaultSettings,
          ...loadedSettings,
        },
        saves: {
          ...defaultSavedGames,
          ...loadedSaves,
        },
      });
    })().finally(() => {
      hydratePromise = null;
    });
  }

  await hydratePromise;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

async function updateSettings(patch: Partial<AppSettings>) {
  const nextSettings = {
    ...snapshot.settings,
    ...patch,
  };

  setSnapshot({
    ...snapshot,
    settings: nextSettings,
  });
  await saveJson(storageAdapter, SETTINGS_KEY, nextSettings);
}

async function saveGame(
  variant: GameVariant,
  envelope: PersistedGameEnvelope<KlondikeState>,
) {
  const nextSaves = {
    ...snapshot.saves,
    [variant]: envelope,
  };

  setSnapshot({
    ...snapshot,
    saves: nextSaves,
  });
  await saveJson(storageAdapter, SAVES_KEY, nextSaves);
}

async function clearGame(variant: GameVariant) {
  const nextSaves = {
    ...snapshot.saves,
    [variant]: null,
  };

  setSnapshot({
    ...snapshot,
    saves: nextSaves,
  });
  await saveJson(storageAdapter, SAVES_KEY, nextSaves);
}

export function useAppModel(): AppModelValue {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void ensureHydrated();
  }, []);

  return {
    ...current,
    updateSettings,
    saveGame,
    clearGame,
  };
}
