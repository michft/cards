import { describe, expect, it, vi } from 'vitest';

import { loadJson, type StorageAdapter } from '../src/storage';

describe('loadJson', () => {
  it('rejects when storage is unavailable rather than treating unread data as missing', async () => {
    const adapter: StorageAdapter = {
      getItem: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    await expect(loadJson(adapter, 'settings', { drawCount: 3 })).rejects.toThrow('Storage unavailable');
  });

  it.each([null, 'invalid JSON'])('returns fallback for absent or malformed JSON: %s', async (value) => {
    const adapter: StorageAdapter = {
      getItem: vi.fn().mockResolvedValue(value),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    await expect(loadJson(adapter, 'settings', { drawCount: 3 })).resolves.toEqual({ drawCount: 3 });
  });
});
