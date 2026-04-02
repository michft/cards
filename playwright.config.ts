import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web',
  use: {
    baseURL: 'http://127.0.0.1:8081',
  },
  webServer: {
    command: 'python3 -m http.server 8081 -d apps/app/dist',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
