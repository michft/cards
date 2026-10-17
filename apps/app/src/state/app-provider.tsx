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

const settingValues: { [Key in keyof AppSettings]: readonly AppSettings[Key][] } = {
  drawCount: [1, 3],
  hintMode: ['balanced', 'mobility', 'foundation-first'],
  emptyTableauPolicy: ['any', 'king-only'],
  spiderSuitMode: ['spades-only', 'hearts-only', 'red-black', 'all-suits'],
  freeCellTableauBuildPolicy: ['any', 'alternate-red-black', 'suit-matching'],
  klondikeDebugTools: [true, false],
  spiderDebugTools: [true, false],
  freeCellDebugTools: [true, false],
  pyramidDebugTools: [true, false],
  clockDebugTools: [true, false],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSettings(value: unknown): AppSettings {
  const settings = { ...defaultSettings };
  if (!isRecord(value)) return settings;

  for (const key of Object.keys(settingValues) as Array<keyof AppSettings>) {
    const candidate = key === 'freeCellTableauBuildPolicy' && value[key] === 'red-black'
      ? 'alternate-red-black'
      : value[key];
    if ((settingValues[key] as readonly unknown[]).includes(candidate)) {
      Object.assign(settings, { [key]: candidate });
    }
  }
  return settings;
}

function isGameEnvelope(value: unknown, variant: GameVariant): value is Record<string, unknown> {
  return isRecord(value) && value.gameId === variant
    && typeof value.updatedAt === 'string' && isRecord(value.state);
}

function normalizeSaves(value: unknown): SavedGames {
  const saves = { ...defaultSavedGames };
  if (!isRecord(value)) return saves;

  for (const variant of Object.keys(saves) as GameVariant[]) {
    if (isGameEnvelope(value[variant], variant)) {
      Object.assign(saves, { [variant]: value[variant] });
    }
  }
  return saves;
}

function normalizeSnapshots(value: unknown): SavedSnapshots {
  const snapshots = { ...defaultSavedSnapshots };
  if (!isRecord(value)) return snapshots;

  for (const variant of Object.keys(snapshots) as GameVariant[]) {
    const entries = value[variant];
    if (Array.isArray(entries)) {
      Object.assign(snapshots, {
        [variant]: entries.filter((entry: unknown) => isGameEnvelope(entry, variant)
          && typeof entry.id === 'string' && typeof entry.label === 'string'),
      });
    }
  }
  return snapshots;
}

type AppSnapshot = {
  hydrated: boolean;
  hydrationError: string | null;
  settings: AppSettings;
  saves: SavedGames;
  snapshots: SavedSnapshots;
};

type AppModelValue = AppSnapshot & {
  retryHydration(): Promise<void>;
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
  hydrationError: null,
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
        loadJson<unknown>(storageAdapter, SETTINGS_KEY, defaultSettings),
        loadJson<unknown>(storageAdapter, SAVES_KEY, defaultSavedGames),
        loadJson<unknown>(storageAdapter, SNAPSHOTS_KEY, defaultSavedSnapshots),
      ]);

      setSnapshot({
        hydrated: true,
        hydrationError: null,
        settings: normalizeSettings(loadedSettings),
        saves: normalizeSaves(loadedSaves),
        snapshots: normalizeSnapshots(loadedSnapshots),
      });
    })().catch((error: unknown) => {
      setSnapshot({ ...snapshot, hydrationError: 'Saved games could not be read. Retry before playing.' });
      throw error;
    }).finally(() => {
      hydratePromise = null;
    });
  }

  await hydratePromise;
}

async function retryHydration() {
  await ensureHydrated().catch(() => {});
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
  await ensureHydrated();
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
  await ensureHydrated();
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
  await ensureHydrated();
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
  await ensureHydrated();
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
  await ensureHydrated();
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
    void retryHydration();
  }, []);

  return {
    ...current,
    retryHydration,
    updateSettings,
    saveGame,
    saveSnapshot,
    deleteSnapshot,
    clearGame,
  };
}
