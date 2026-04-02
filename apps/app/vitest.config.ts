import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      '@mumscards/engine-core': path.resolve(__dirname, '../../packages/engine-core/src'),
      '@mumscards/game-klondike': path.resolve(__dirname, '../../packages/game-klondike/src'),
      '@mumscards/storage': path.resolve(__dirname, '../../packages/storage/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts?(x)'],
  },
});
