import { describe, expect, it, vi } from 'vitest';

import { loadJson, type StorageAdapter } from '../src/storage';

describe('loadJson', () => {
  it('returns fallback when storage read fails', async () => {
    const adapter: StorageAdapter = {
      getItem: vi.fn().mockRejectedValue(new Error('Storage unavailable')),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    await expect(loadJson(adapter, 'settings', { drawCount: 3 })).resolves.toEqual({ drawCount: 3 });
  });
});
