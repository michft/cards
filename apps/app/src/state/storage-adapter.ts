import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageAdapter } from '@mumscards/storage';
import { Platform } from 'react-native';

export async function withStorageLock<T>(operation: () => Promise<T>): Promise<T> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    if (!navigator.locks) {
      const error = new Error('Saving requires Web Locks support in a secure browser context (HTTPS or localhost).');
      error.name = 'StorageLockUnavailable';
      throw error;
    }
    return navigator.locks.request('mumscards.storage', operation);
  }
  return operation();
}

export const storageAdapter: StorageAdapter = {
  async getItem(key) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(key);
    }

    return AsyncStorage.getItem(key);
  },
  async setItem(key, value) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      return;
    }

    await AsyncStorage.setItem(key, value);
  },
  async removeItem(key) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
      return;
    }

    await AsyncStorage.removeItem(key);
  },
};
