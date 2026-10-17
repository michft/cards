import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createKlondikeGame, type KlondikeState } from '@mumscards/game-klondike';
import { createFreeCellGame } from '@mumscards/game-freecell';
import type { PersistedGameEnvelope } from '@mumscards/engine-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSettings } from './types';

const adapter = vi.hoisted(() => ({
  getItem: vi.fn<(key: string) => Promise<string | null>>(),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(),
  removeItem: vi.fn<(key: string) => Promise<void>>(),
}));

vi.mock('./storage-adapter', () => ({ storageAdapter: adapter,
  withStorageLock: async (operation: () => Promise<void>) => operation() }));

beforeEach(() => {
  vi.resetModules();
  adapter.getItem.mockReset().mockResolvedValue(null);
  adapter.setItem.mockReset().mockResolvedValue();
  adapter.removeItem.mockReset().mockResolvedValue();
});

afterEach(cleanup);

function envelope(drawCount: 1 | 3): PersistedGameEnvelope<KlondikeState> {
  return {
    gameId: 'klondike',
    updatedAt: '2026-10-11T00:00:00.000Z',
    state: createKlondikeGame(() => 0.5, { drawCount }),
  };
}

describe('App persistence', () => {
  it('reports failed writes without claiming durability and retries the latest deal', async () => {
    const stored = new Map<string, string>();
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockRejectedValue(new Error('Quota exceeded'));
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await expect(result.current.saveGame('klondike', envelope(3))).resolves.toBeUndefined();
      await result.current.saveGame('klondike', envelope(1));
    });
    expect(result.current.persistenceError).toContain('could not be saved');
    expect(result.current.saves.klondike).toBeNull();
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    await act(async () => { await result.current.retryPersistence(); });
    expect(result.current.persistenceError).toBeNull();
    expect(JSON.parse(stored.get('mumscards.saves')!).klondike.state.drawCount).toBe(1);
  });

  it('merges another tab\'s different game instead of overwriting it', async () => {
    const stored = new Map<string, string>();
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const freecell = { gameId: 'freecell', updatedAt: '2026-10-18', state: createFreeCellGame(() => 0.5) };
    stored.set('mumscards.saves', JSON.stringify({ freecell }));
    await act(async () => { await result.current.saveGame('klondike', envelope(1)); });
    expect(JSON.parse(stored.get('mumscards.saves')!).freecell).toEqual(freecell);
    expect(result.current.saves.freecell).toEqual(freecell);
  });

  it('blocks stale same-game writes until explicitly loading the latest saves', async () => {
    const stored = new Map([['mumscards.saves', JSON.stringify({ klondike: envelope(3) })]]);
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const latest = envelope(1);
    stored.set('mumscards.saves', JSON.stringify({ klondike: latest }));
    await act(async () => { await result.current.saveGame('klondike', envelope(3)); });
    expect(adapter.setItem).not.toHaveBeenCalled();
    expect(result.current.storageConflict).toBe(true);
    const revision = result.current.saveRevision;
    await act(async () => { await result.current.reloadSavedGames(); });
    expect(result.current.saveRevision).toBe(revision + 1);
    expect(result.current.saves.klondike).toEqual(latest);
    expect(result.current.persistenceError).toBeNull();
  });

  it('does not advance a stale game baseline when merging another variant', async () => {
    const oldFreeCell = { gameId: 'freecell', updatedAt: '2026-10-18', state: createFreeCellGame(() => 0.5) };
    const newerFreeCell = { ...oldFreeCell, state: createFreeCellGame(() => 0.25) };
    const stored = new Map([['mumscards.saves', JSON.stringify({ freecell: oldFreeCell })]]);
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    stored.set('mumscards.saves', JSON.stringify({ freecell: newerFreeCell }));
    await act(async () => { await result.current.saveGame('klondike', envelope(3)); });
    await act(async () => { await result.current.saveGame('freecell', oldFreeCell); });
    expect(result.current.storageConflict).toBe(true);
    expect(JSON.parse(stored.get('mumscards.saves')!).freecell).toEqual(newerFreeCell);
    expect(adapter.setItem).toHaveBeenCalledTimes(1);
  });

  it('cancels old save intents when explicitly reloading another tab\'s progress', async () => {
    const stored = new Map([['mumscards.saves', JSON.stringify({ klondike: envelope(3) })]]);
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    stored.set('mumscards.saves', JSON.stringify({ klondike: envelope(1) }));
    await act(async () => {
      const stale = result.current.saveGame('klondike', envelope(3));
      const reload = result.current.reloadSavedGames();
      await Promise.all([stale, reload]);
    });
    expect(adapter.setItem).not.toHaveBeenCalled();
    expect(result.current.saves.klondike?.state.drawCount).toBe(1);
  });

  it('retries settings and manual snapshots without dropping patches or duplicating snapshots', async () => {
    const stored = new Map<string, string>();
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockRejectedValue(new Error('Quota exceeded'));
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => {
      await result.current.updateSettings({ drawCount: 1 });
      await result.current.updateSettings({ hintMode: 'mobility' });
      await result.current.saveSnapshot('klondike', envelope(1), 'Keep this deal');
    });
    expect(result.current.snapshots.klondike).toEqual([]);
    adapter.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
    await act(async () => { await result.current.retryPersistence(); await result.current.retryPersistence(); });
    expect(result.current.settings).toMatchObject({ drawCount: 1, hintMode: 'mobility' });
    expect(result.current.snapshots.klondike).toHaveLength(1);
    expect(result.current.snapshots.klondike[0].label).toBe('Keep this deal');
  });

  it('serializes writes so a slow earlier save cannot finish after a newer one', async () => {
    const stored = new Map<string, string>();
    let finish: () => void = () => {};
    const delayed = new Promise<void>((resolve) => { finish = resolve; });
    adapter.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
    adapter.setItem.mockImplementation(async (key, value) => {
      if (adapter.setItem.mock.calls.length === 1) await delayed;
      stored.set(key, value);
    });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let first = Promise.resolve();
    let second = Promise.resolve();
    act(() => { first = result.current.saveGame('klondike', envelope(3)); });
    await waitFor(() => expect(adapter.setItem).toHaveBeenCalledTimes(1));
    act(() => { second = result.current.saveGame('klondike', envelope(1)); });
    await act(async () => { await Promise.resolve(); });
    expect(adapter.setItem).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); await Promise.all([first, second]); });
    expect(JSON.parse(stored.get('mumscards.saves')!).klondike.state.drawCount).toBe(1);
  });

  it.each(['settings', 'saveGame', 'clearGame', 'saveSnapshot', 'deleteSnapshot'] as const)(
    'waits for hydration before %s writes',
    async (operation) => {
      let resolveSettings: (value: string) => void = () => {};
      const settingsRead = new Promise<string>((resolve) => { resolveSettings = resolve; });
      const oldEnvelope = envelope(3);
      const storedSnapshot = { ...oldEnvelope, id: 'old', label: 'Old game' };
      adapter.getItem.mockImplementation(async (key) => {
        if (key === 'mumscards.settings') return settingsRead;
        if (key === 'mumscards.saves') return JSON.stringify({ klondike: oldEnvelope });
        if (key === 'mumscards.snapshots') return JSON.stringify({ klondike: [storedSnapshot] });
        return null;
      });
      const { useAppModel } = await import('./app-provider');
      const { result } = renderHook(useAppModel);
      let mutation: Promise<void> = Promise.resolve();

      act(() => {
        switch (operation) {
          case 'settings': mutation = result.current.updateSettings({ hintMode: 'mobility' }); break;
          case 'saveGame': mutation = result.current.saveGame('klondike', envelope(1)); break;
          case 'clearGame': mutation = result.current.clearGame('klondike'); break;
          case 'saveSnapshot': mutation = result.current.saveSnapshot('klondike', envelope(1)); break;
          case 'deleteSnapshot': mutation = result.current.deleteSnapshot('klondike', 'old'); break;
        }
      });

      expect(adapter.setItem).not.toHaveBeenCalled();
      await act(async () => {
        resolveSettings(JSON.stringify({ drawCount: 1, spiderSuitMode: 'all-suits' }));
        await mutation;
      });

      expect(result.current.hydrated).toBe(true);
      expect(result.current.settings.drawCount).toBe(1);
      expect(result.current.settings.spiderSuitMode).toBe('all-suits');
      expect(adapter.setItem).toHaveBeenCalledTimes(1);
      if (operation === 'settings') {
        expect(result.current.settings.hintMode).toBe('mobility');
        expect(JSON.parse(adapter.setItem.mock.calls[0][1])).toMatchObject({
          drawCount: 1, spiderSuitMode: 'all-suits', hintMode: 'mobility',
        });
      } else if (operation === 'saveGame') {
        expect(result.current.saves.klondike?.state.drawCount).toBe(1);
      } else if (operation === 'clearGame') {
        expect(result.current.saves.klondike).toBeNull();
      } else if (operation === 'saveSnapshot') {
        expect(result.current.snapshots.klondike).toHaveLength(2);
        expect(result.current.snapshots.klondike[1]).toEqual(storedSnapshot);
      } else {
        expect(result.current.snapshots.klondike).toEqual([]);
      }
    },
  );

  const invalidSettings: unknown[] = [null, [], 'invalid', {
    drawCount: 2,
    hintMode: null,
    emptyTableauPolicy: 'invalid',
    spiderSuitMode: 'invalid',
    freeCellTableauBuildPolicy: false,
    klondikeDebugTools: 'true',
    spiderDebugTools: 1,
    freeCellDebugTools: null,
    pyramidDebugTools: [],
    clockDebugTools: {},
  }];

  it.each(invalidSettings.map((settings) => ({ settings })))(
    'falls back for invalid stored settings: $settings', async ({ settings }) => {
      adapter.getItem.mockImplementation(async (key) =>
        key === 'mumscards.settings' ? JSON.stringify(settings) : null,
      );
      const { useAppModel } = await import('./app-provider');
      const { result } = renderHook(useAppModel);

      await waitFor(() => expect(result.current.hydrated).toBe(true));
      expect(result.current.settings).toEqual(defaultSettings);
    },
  );

  it('keeps valid settings, migrates legacy policy, and ignores unknown keys', async () => {
    adapter.getItem.mockImplementation(async (key) => key === 'mumscards.settings'
      ? JSON.stringify({ drawCount: 1, clockDebugTools: true, freeCellTableauBuildPolicy: 'red-black', unknown: true })
      : null);
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.settings).toEqual({
      ...defaultSettings, drawCount: 1, clockDebugTools: true,
    });
  });

  it('blocks hydration and writes after a storage read fails, then recovers saved games on retry', async () => {
    const oldEnvelope = envelope(3);
    let unavailable = true;
    adapter.getItem.mockImplementation(async (key) => {
      if (key === 'mumscards.saves') {
        if (unavailable) throw new Error('Storage unavailable');
        return JSON.stringify({ klondike: oldEnvelope });
      }
      return null;
    });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);

    await waitFor(() => expect(result.current.hydrationError).toBeTruthy());
    expect(result.current.hydrated).toBe(false);
    await act(async () => {
      await expect(result.current.clearGame('clock')).rejects.toThrow('Storage unavailable');
    });
    expect(adapter.setItem).not.toHaveBeenCalled();
    expect(result.current.hydrated).toBe(false);

    unavailable = false;
    await act(async () => { await result.current.retryHydration(); });
    expect(result.current.hydrated).toBe(true);
    expect(result.current.hydrationError).toBeNull();
    expect(result.current.saves.klondike).toEqual(oldEnvelope);
    await act(async () => { await result.current.clearGame('clock'); });
    expect(JSON.parse(adapter.setItem.mock.calls[0][1]).klondike).toEqual(oldEnvelope);
  });

  it('rejects every mutation while storage cannot be read', async () => {
    adapter.getItem.mockRejectedValue(new Error('Storage unavailable'));
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);
    await waitFor(() => expect(result.current.hydrationError).toBeTruthy());

    await act(async () => {
      await expect(result.current.updateSettings({ drawCount: 1 })).rejects.toThrow('Storage unavailable');
      await expect(result.current.saveGame('klondike', envelope(1))).rejects.toThrow('Storage unavailable');
      await expect(result.current.clearGame('klondike')).rejects.toThrow('Storage unavailable');
      await expect(result.current.saveSnapshot('klondike', envelope(1))).rejects.toThrow('Storage unavailable');
      await expect(result.current.deleteSnapshot('klondike', 'old')).rejects.toThrow('Storage unavailable');
    });

    expect(adapter.setItem).not.toHaveBeenCalled();
    expect(result.current.hydrated).toBe(false);
  });

  it('discards invalid save and snapshot containers', async () => {
    const storedSnapshot = { ...envelope(3), id: 'valid', label: 'Valid game' };
    adapter.getItem.mockImplementation(async (key) => {
      if (key === 'mumscards.saves') return JSON.stringify({ klondike: [] });
      if (key === 'mumscards.snapshots') return JSON.stringify({
        klondike: [null, {}, storedSnapshot], freecell: null, spider: {},
      });
      return null;
    });
    const { useAppModel } = await import('./app-provider');
    const { result } = renderHook(useAppModel);

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.saves.klondike).toBeNull();
    expect(result.current.snapshots.klondike).toEqual([storedSnapshot]);
    expect(result.current.snapshots.freecell).toEqual([]);
    expect(result.current.snapshots.spider).toEqual([]);
  });
});
