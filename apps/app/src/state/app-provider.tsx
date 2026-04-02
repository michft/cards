import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import type { KlondikeState } from '@mumscards/game-klondike';
import { loadJson, saveJson } from '@mumscards/storage';
import {
  useCallback,
  useEffect,
  useState,
} from 'react';

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

type AppModelValue = {
  hydrated: boolean;
  settings: AppSettings;
  saves: SavedGames;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  saveGame(
    variant: GameVariant,
    envelope: PersistedGameEnvelope<KlondikeState>,
  ): Promise<void>;
  clearGame(variant: GameVariant): Promise<void>;
};

let cachedSettings = defaultSettings;
let cachedSaves = defaultSavedGames;
let cacheHydrated = false;

export function useAppModel() {
  const [hydrated, setHydrated] = useState(cacheHydrated);
  const [settings, setSettings] = useState<AppSettings>(cachedSettings);
  const [saves, setSaves] = useState<SavedGames>(cachedSaves);

  useEffect(() => {
    let active = true;

    void (async () => {
      const [loadedSettings, loadedSaves] = await Promise.all([
        loadJson(storageAdapter, SETTINGS_KEY, defaultSettings),
        loadJson(storageAdapter, SAVES_KEY, defaultSavedGames),
      ]);

      if (!active) {
        return;
      }

      cachedSettings = {
        ...defaultSettings,
        ...loadedSettings,
      };
      cachedSaves = {
        ...defaultSavedGames,
        ...loadedSaves,
      };
      cacheHydrated = true;

      setSettings(cachedSettings);
      setSaves(cachedSaves);
      setHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const nextSettings = {
      ...cachedSettings,
      ...patch,
    };

    cachedSettings = nextSettings;
    setSettings(nextSettings);
    await saveJson(storageAdapter, SETTINGS_KEY, nextSettings);
  }, []);

  const saveGame = useCallback(
    async (variant: GameVariant, envelope: PersistedGameEnvelope<KlondikeState>) => {
      const nextSaves = {
        ...cachedSaves,
        [variant]: envelope,
      };

      cachedSaves = nextSaves;
      setSaves(nextSaves);
      await saveJson(storageAdapter, SAVES_KEY, nextSaves);
    },
    [],
  );

  const clearGame = useCallback(async (variant: GameVariant) => {
    const nextSaves = {
      ...cachedSaves,
      [variant]: null,
    };

    cachedSaves = nextSaves;
    setSaves(nextSaves);
    await saveJson(storageAdapter, SAVES_KEY, nextSaves);
  }, []);

  return {
    hydrated,
    settings,
    saves,
    updateSettings,
    saveGame,
    clearGame,
  } satisfies AppModelValue;
}
