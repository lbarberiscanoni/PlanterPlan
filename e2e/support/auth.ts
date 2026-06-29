import { type Page, expect } from '@playwright/test';

export type Role = 'admin' | 'planter' | 'team';

function creds(role: Role): { email: string; password: string } {
  const password = process.env.E2E_PASSWORD ?? '';
  const email = {
    admin: process.env.E2E_ADMIN_EMAIL,
    planter: process.env.E2E_PLANTER_EMAIL,
    team: process.env.E2E_TEAM_EMAIL,
  }[role];
  if (!email || !password) {
    throw new Error(`Missing creds for role "${role}". Set E2E_${role.toUpperCase()}_EMAIL and E2E_PASSWORD.`);
  }
  return { email, password };
}

/**
 * Log in via the real LoginForm. Selectors verified:
 *   #email / #password (LoginForm.tsx:108/131), submit is button[type=submit] (147),
 *   success navigates to /tasks (LoginForm.tsx:75).
 */
export async function loginAs(page: Page, role: Role): Promise<void> {
  const { email, password } = creds(role);
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL('**/tasks', { timeout: 20_000 });
  await expect(page.locator('#email')).toHaveCount(0); // login form gone = authenticated
}
