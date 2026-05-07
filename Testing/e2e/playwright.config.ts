import { defineConfig, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { defineBddConfig } from 'playwright-bdd';

const require = createRequire(import.meta.url);
const { resolveE2EEnv } = require('../../scripts/e2e-env.cjs') as {
  resolveE2EEnv: () => Record<string, string>;
};
const e2eEnv = resolveE2EEnv();

const testDir = defineBddConfig({
  disableWarnings: { importTestFrom: true },
  features: 'features/**/*.feature',
  importTestFrom: './fixtures/base.fixture.ts',
  steps: 'steps/**/*.steps.ts',
});

export default defineConfig({
  globalSetup: './global-setup.ts',
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
      ...e2eEnv,
    },
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
