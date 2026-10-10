export type StorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export async function loadJson<T>(
  adapter: StorageAdapter,
  key: string,
  fallback: T,
): Promise<T> {
  const value = await adapter.getItem(key);

  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function saveJson<T>(
  adapter: StorageAdapter,
  key: string,
  value: T,
): Promise<void> {
  await adapter.setItem(key, JSON.stringify(value));
}
