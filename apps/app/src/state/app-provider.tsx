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
import { storageAdapter, withStorageLock } from './storage-adapter';
import { parseGameEnvelope, parseSavedSnapshot } from './game-validation';

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

function normalizeSaves(value: unknown): SavedGames {
  const saves = { ...defaultSavedGames };
  if (!isRecord(value)) return saves;

  for (const variant of Object.keys(saves) as GameVariant[]) {
    Object.assign(saves, { [variant]: parseGameEnvelope(variant, value[variant]) });
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
        [variant]: entries.flatMap((entry: unknown) => {
          const parsed = parseSavedSnapshot(variant, entry);
          return parsed ? [parsed] : [];
        }),
      });
    }
  }
  return snapshots;
}

type AppSnapshot = {
  hydrated: boolean;
  hydrationError: string | null;
  persistenceError: string | null;
  storageConflict: boolean;
  saveRevision: number;
  settings: AppSettings;
  saves: SavedGames;
  snapshots: SavedSnapshots;
};

type AppModelValue = AppSnapshot & {
  retryHydration(): Promise<void>;
  retryPersistence(): Promise<void>;
  reloadSavedGames(): Promise<void>;
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
  persistenceError: null,
  storageConflict: false,
  saveRevision: 0,
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

      const saves = normalizeSaves(loadedSaves);
      knownSaves = saves;
      setSnapshot({
        ...snapshot,
        hydrated: true,
        hydrationError: null,
        settings: normalizeSettings(loadedSettings),
        saves,
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
  if (reloading) return;
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

class StorageConflict extends Error {}

type PendingWrite = { generation: number; run(): Promise<void> };
const pendingWrites = new Map<string, PendingWrite>();
let writeQueue = Promise.resolve();
let generation = 0;
let reloading = false;
let knownSaves = defaultSavedGames;

async function retryPersistence() {
  writeQueue = writeQueue.then(async () => {
    if (snapshot.storageConflict) return;
    for (const [id, task] of pendingWrites) {
      if (task.generation !== generation) { pendingWrites.delete(id); continue; }
      try {
        await withStorageLock(async () => {
          if (task.generation === generation) await task.run();
        });
        if (pendingWrites.get(id) === task) pendingWrites.delete(id);
      } catch (error: unknown) {
        setSnapshot({ ...snapshot,
          persistenceError: error instanceof StorageConflict
            ? 'This game changed in another tab. Changes here were not saved. Load latest saves to discard local changes.'
            : error instanceof Error && error.name === 'StorageLockUnavailable'
              ? error.message
              : 'Changes could not be saved. Keep this page open and retry.',
          storageConflict: error instanceof StorageConflict,
        });
        return;
      }
    }
    setSnapshot({ ...snapshot, persistenceError: null });
  });
  await writeQueue;
}

async function queueWrite(id: string, run: () => Promise<void>) {
  pendingWrites.set(id, { generation, run });
  await retryPersistence();
}

async function reloadSavedGames() {
  if (reloading) return;
  reloading = true;
  generation += 1;
  pendingWrites.clear();
  setSnapshot({ ...snapshot, hydrated: false });
  await writeQueue;
  setSnapshot({ ...snapshot, hydrated: false, saveRevision: snapshot.saveRevision + 1,
    persistenceError: null, storageConflict: false, hydrationError: null });
  reloading = false;
  await retryHydration();
}

async function updateSettings(patch: Partial<AppSettings>) {
  if (reloading) return;
  const requestedGeneration = generation;
  await ensureHydrated();
  if (reloading || requestedGeneration !== generation) return;
  // Keep distinct patches queued so a failed earlier setting is not lost on retry.
  await queueWrite(`settings:${createSnapshotId()}`, async () => {
    const currentGeneration = generation;
    const stored = normalizeSettings(await loadJson<unknown>(storageAdapter, SETTINGS_KEY, defaultSettings));
    if (currentGeneration !== generation) return;
    const settings = normalizeSettings({ ...stored, ...patch });
    await saveJson(storageAdapter, SETTINGS_KEY, settings);
    if (currentGeneration === generation) setSnapshot({ ...snapshot, settings });
  });
}

function saveFingerprint(envelope: PersistedGameEnvelope<object> | null): string {
  if (!envelope) return 'null';
  return JSON.stringify({ state: envelope.state,
    initial: envelope.history?.initial ?? envelope.state,
    past: envelope.history?.past ?? [], future: envelope.history?.future ?? [] });
}

async function writeGame<Variant extends GameVariant>(
  variant: Variant,
  envelope: PersistedGameEnvelope<GameStateMap[Variant]> | null,
) {
  if (reloading) return;
  const requestedGeneration = generation;
  await ensureHydrated();
  if (reloading || requestedGeneration !== generation) return;
  await queueWrite(`game:${variant}`, async () => {
    const currentGeneration = generation;
    const stored = normalizeSaves(await loadJson<unknown>(storageAdapter, SAVES_KEY, defaultSavedGames));
    if (currentGeneration !== generation) return;
    if (saveFingerprint(stored[variant]) !== saveFingerprint(knownSaves[variant])
      && saveFingerprint(stored[variant]) !== saveFingerprint(envelope)) {
      throw new StorageConflict();
    }
    const saves = { ...stored, [variant]: envelope };
    await saveJson(storageAdapter, SAVES_KEY, saves);
    if (currentGeneration === generation) {
      // Merging another variant must not authorize a stale mounted game's next write.
      knownSaves = { ...knownSaves, [variant]: envelope };
      setSnapshot({ ...snapshot, saves });
    }
  });
}

async function saveGame<Variant extends GameVariant>(
  variant: Variant,
  envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
) {
  await writeGame(variant, envelope);
}

function createSnapshotId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function saveSnapshot<Variant extends GameVariant>(
  variant: Variant,
  envelope: PersistedGameEnvelope<GameStateMap[Variant]>,
  label?: string,
) {
  if (reloading) return;
  const requestedGeneration = generation;
  await ensureHydrated();
  if (reloading || requestedGeneration !== generation) return;
  const entry = { ...envelope, id: createSnapshotId(),
    label: label?.trim() || new Date(envelope.updatedAt).toLocaleString() };
  await queueWrite(`snapshot:${entry.id}`, async () => {
    const currentGeneration = generation;
    const stored = normalizeSnapshots(await loadJson<unknown>(storageAdapter, SNAPSHOTS_KEY, defaultSavedSnapshots));
    if (currentGeneration !== generation) return;
    const snapshots = { ...stored, [variant]: [entry,
      ...stored[variant].filter((saved) => saved.id !== entry.id)].slice(0, SNAPSHOT_LIMIT) } as SavedSnapshots;
    await saveJson(storageAdapter, SNAPSHOTS_KEY, snapshots);
    if (currentGeneration === generation) setSnapshot({ ...snapshot, snapshots });
  });
}

async function deleteSnapshot(variant: GameVariant, snapshotId: string) {
  if (reloading) return;
  const requestedGeneration = generation;
  await ensureHydrated();
  if (reloading || requestedGeneration !== generation) return;
  await queueWrite(`delete:${variant}:${snapshotId}`, async () => {
    const currentGeneration = generation;
    const stored = normalizeSnapshots(await loadJson<unknown>(storageAdapter, SNAPSHOTS_KEY, defaultSavedSnapshots));
    if (currentGeneration !== generation) return;
    const snapshots = { ...stored,
      [variant]: stored[variant].filter((entry) => entry.id !== snapshotId) } as SavedSnapshots;
    await saveJson(storageAdapter, SNAPSHOTS_KEY, snapshots);
    if (currentGeneration === generation) setSnapshot({ ...snapshot, snapshots });
  });
}

async function clearGame(variant: GameVariant) {
  await writeGame(variant, null);
}

export function useAppModel(): AppModelValue {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    void retryHydration();
  }, []);

  return {
    ...current,
    retryHydration,
    retryPersistence,
    reloadSavedGames,
    updateSettings,
    saveGame,
    saveSnapshot,
    deleteSnapshot,
    clearGame,
  };
}
