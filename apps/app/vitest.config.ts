import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
      'react-native': 'react-native-web',
      '@mumscards/engine-core': path.resolve(__dirname, '../../packages/engine-core/src'),
      '@mumscards/game-klondike': path.resolve(__dirname, '../../packages/game-klondike/src'),
      '@mumscards/game-clock': path.resolve(__dirname, '../../packages/game-clock/src'),
      '@mumscards/game-freecell': path.resolve(__dirname, '../../packages/game-freecell/src'),
      '@mumscards/game-pyramid': path.resolve(__dirname, '../../packages/game-pyramid/src'),
      '@mumscards/game-spider': path.resolve(__dirname, '../../packages/game-spider/src'),
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
