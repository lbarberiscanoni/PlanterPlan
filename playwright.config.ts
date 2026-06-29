import { defineConfig, devices } from '@playwright/test';

/**
 * PlanterPlan e2e config.
 *
 * Runs against a DEPLOYED url (local can't reach remote Supabase; no local Docker).
 * Because there is no separate test DB, every spec mutates LIVE Supabase, so:
 *   - workers: 1            → no two specs drive the shared test accounts at once
 *   - fullyParallel: false  → deterministic ordering for the cross-role handoffs
 *   - globalTeardown        → tag-scoped, owner-pinned cleanup of everything a run created
 *
 * Required env (see .env.e2e.example):
 *   E2E_BASE_URL, E2E_RUN_ID, E2E_PASSWORD,
 *   E2E_ADMIN_EMAIL, E2E_PLANTER_EMAIL, E2E_TEAM_EMAIL,
 *   E2E_SUPABASE_URL, E2E_SUPABASE_SERVICE_ROLE_KEY   (cleanup only)
 *
 * Select a tier with --grep:  `playwright test --grep @smoke`
 */
export default defineConfig({
  testDir: './e2e',
  globalTeardown: './e2e/support/global-teardown.ts',

  // Live shared DB → never parallelize.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0, // remote flakiness; one retry max

  timeout: 60_000,
  expect: { timeout: 15_000 },

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['list']]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'smoke',
      grep: /@smoke/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'regression',
      grep: /@regression/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      // Nightly backstop — no browser navigation; runs the stale-data sweep. Kept out of the
      // smoke/regression projects so a normal run never reaps mid-flight.
      name: 'reaper',
      grep: /@reaper/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
