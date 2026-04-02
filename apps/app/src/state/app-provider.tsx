import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { loadJson, saveJson } from '@mumscards/storage';
import { useEffect, useSyncExternalStore } from 'react';

import {
  defaultSavedGames,
  defaultSavedSnapshots,
  defaultSettings,
  type AppSettings,
  type GameStateMap,
  type GameVariant,
  type SavedGames,
  type SavedSnapshots,
} from './types';
import { storageAdapter } from './storage-adapter';

const SETTINGS_KEY = 'mumscards.settings';
const SAVES_KEY = 'mumscards.saves';
const SNAPSHOTS_KEY = 'mumscards.snapshots';
const SNAPSHOT_LIMIT = 20;

type AppSnapshot = {
  hydrated: boolean;
  settings: AppSettings;
  saves: SavedGames;
  snapshots: SavedSnapshots;
};

type AppModelValue = AppSnapshot & {
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  saveGame<Variant extends GameVariant>(
    variant: Variant,
    envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
  ): Promise<void>;
  saveSnapshot<Variant extends GameVariant>(
    variant: Variant,
    envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
    label?: string,
  ): Promise<void>;
  deleteSnapshot(variant: GameVariant, snapshotId: string): Promise<void>;
  clearGame(variant: GameVariant): Promise<void>;
};

let snapshot: AppSnapshot = {
  hydrated: false,
  settings: defaultSettings,
  saves: defaultSavedGames,
  snapshots: defaultSavedSnapshots,
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
      const [loadedSettings, loadedSaves, loadedSnapshots] = await Promise.all([
        loadJson(storageAdapter, SETTINGS_KEY, defaultSettings),
        loadJson(storageAdapter, SAVES_KEY, defaultSavedGames),
        loadJson(storageAdapter, SNAPSHOTS_KEY, defaultSavedSnapshots),
      ]);

      setSnapshot({
        hydrated: true,
        settings: {
          ...defaultSettings,
          ...loadedSettings,
          freeCellTableauBuildPolicy:
            loadedSettings.freeCellTableauBuildPolicy === 'red-black'
              ? 'alternate-red-black'
              : (loadedSettings.freeCellTableauBuildPolicy ??
                defaultSettings.freeCellTableauBuildPolicy),
        },
        saves: {
          ...defaultSavedGames,
          ...loadedSaves,
        },
        snapshots: {
          ...defaultSavedSnapshots,
          ...loadedSnapshots,
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

async function saveGame<Variant extends GameVariant>(
  variant: Variant,
  envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
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

function createSnapshotId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function createSnapshotLabel(updatedAt: string) {
  const date = new Date(updatedAt);
  return date.toLocaleString();
}

async function saveSnapshot<Variant extends GameVariant>(
  variant: Variant,
  envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
  label?: string,
) {
  const nextSnapshots = {
    ...snapshot.snapshots,
    [variant]: [
      {
        ...envelope,
        id: createSnapshotId(),
        label: label?.trim() || createSnapshotLabel(envelope.updatedAt),
      },
      ...snapshot.snapshots[variant],
    ].slice(0, SNAPSHOT_LIMIT),
  } as SavedSnapshots;

  setSnapshot({
    ...snapshot,
    snapshots: nextSnapshots,
  });
  await saveJson(storageAdapter, SNAPSHOTS_KEY, nextSnapshots);
}

async function deleteSnapshot(variant: GameVariant, snapshotId: string) {
  const nextSnapshots = {
    ...snapshot.snapshots,
    [variant]: snapshot.snapshots[variant].filter((entry) => entry.id !== snapshotId),
  } as SavedSnapshots;

  setSnapshot({
    ...snapshot,
    snapshots: nextSnapshots,
  });
  await saveJson(storageAdapter, SNAPSHOTS_KEY, nextSnapshots);
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
    saveSnapshot,
    deleteSnapshot,
    clearGame,
  };
}
