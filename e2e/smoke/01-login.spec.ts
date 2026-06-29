import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * SMK-01 — Login / session gateway. @smoke
 * Verified selectors: #email, #password, form button[type=submit]; success → /tasks (LoginForm.tsx:75).
 */
test.describe('@smoke login', () => {
  test('planter can log in and lands on /tasks', async ({ page }) => {
    await loginAs(page, 'planter');
    await expect(page).toHaveURL(/\/tasks/);
  });

  test('admin can reach /admin; team is redirected away', async ({ page }) => {
    await loginAs(page, 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/); // admin stays on the admin surface

    await page.context().clearCookies();
    await loginAs(page, 'team');
    await page.goto('/admin');
    // Non-admins are toasted + redirected to /dashboard (CLAUDE.md routes).
    await expect(page).not.toHaveURL(/\/admin$/);
  });
});
