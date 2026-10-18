import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/web',
  use: {
    baseURL: 'http://127.0.0.1:8081',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'ipad-webkit', testMatch: /(?:offline|ipad-layout)\.spec\.ts/,
      use: { ...devices['iPad Pro 11'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'pnpm web:preview',
    url: 'http://127.0.0.1:8081',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
