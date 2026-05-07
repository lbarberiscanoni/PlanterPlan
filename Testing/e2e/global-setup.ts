import { chromium, type FullConfig } from '@playwright/test';
import { TEST_USER, ROLE_USERS } from './fixtures/test-data';

const AUTH_DIR = 'e2e/.auth';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function globalSetup(_config: FullConfig) {
  // Ensure auth directory exists
  const fs = await import('fs');
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const browser = await chromium.launch();

  // Create authenticated storage state for the primary test user
  await createAuthState(browser, TEST_USER.email, TEST_USER.password, `${AUTH_DIR}/user.json`);

  if (process.env.E2E_CREATE_ROLE_STATES === 'true') {
    // Create per-role storage states for RBAC tests when local role fixtures exist.
    for (const [role, creds] of Object.entries(ROLE_USERS)) {
      await createAuthState(browser, creds.email, creds.password, `${AUTH_DIR}/${role}.json`);
    }
  }

  await browser.close();
}

async function createAuthState(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  email: string,
  password: string,
  storagePath: string
) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:5173/login');
    await page.waitForLoadState('networkidle');

    // Fill credentials and submit
    await page.fill('#email', email);
    await page.fill('#password', password);
    await page.click('button[type="submit"]');

    // Wait for the current post-login route before persisting auth state.
    await page.waitForURL('**/tasks', { timeout: 15000 });

    // Save storage state
    await context.storageState({ path: storagePath });
  } catch (error) {
    console.warn(`Auth setup failed for ${email}:`, error);
    // Save empty state so tests can handle gracefully
    await context.storageState({ path: storagePath });
  } finally {
    await context.close();
  }
}

export default globalSetup;
