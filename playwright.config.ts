import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testMatch: '**/*.spec.mts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  outputDir: 'test-results/responsive',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    reducedMotion: 'reduce',
    actionTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
  },
});
