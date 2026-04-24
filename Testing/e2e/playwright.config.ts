import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.steps.ts',
});

export default defineConfig({
  testDir,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['json', { outputFile: 'e2e-report.json' }], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
    actionTimeout: 10000,
    navigationTimeout: 15000,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /mobile/,
    },
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testMatch: /accessibility/,
    },
  ],
  webServer: {
    command: 'npm run dev',
    env: {
      ...process.env,
      VITE_E2E_MODE: 'true',
      VITE_TEST_EMAIL: 'test@example.com',
      VITE_TEST_PASSWORD: 'password123',
    },
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
