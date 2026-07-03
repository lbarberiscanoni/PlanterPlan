import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG — admin user suspension actually reaches the backend. @regression @admin @account
 *
 * Guards commit ad689611 / 647ed687: the `admin-user-moderation` edge function
 * called `supabase.auth.getUser()` with NO argument, so on the stateless Edge
 * runtime it resolved the caller from a (nonexistent) stored session and 401'd
 * every request with "Invalid session" — surfacing as the toast
 * "Failed to change suspension state / Edge Function returned a non-2xx status
 * code". The fix passes the bearer token explicitly: `getUser(token)`.
 *
 * The scar this asserts is the SPECIFIC nuance: clicking Suspend produces the
 * success toast (the edge function authenticated the admin), NOT the failure
 * toast. It drives the real aside against the disposable `team` fixture and
 * ALWAYS restores (unsuspend) in `finally`, so a mid-test failure can't leave
 * the shared account banned for later specs.
 */

const SUCCESS_TOAST = 'User suspended.';
const UNSUSPEND_TOAST = 'User unsuspended.';
const FAILURE_TOAST = 'Failed to change suspension state';

/** Open the team fixture's detail aside via the server-side search filter. */
async function openTeamDetail(page: Page): Promise<void> {
  const email = process.env.E2E_TEAM_EMAIL;
  if (!email) throw new Error('E2E_TEAM_EMAIL is required for this spec.');

  await page.goto('/admin/users');
  await expect(page.getByTestId('admin-users')).toBeVisible();

  await page.getByTestId('admin-users-filter-search').fill(email);
  // Row testids are keyed by uid (unknown here) — match the row by its email text.
  const row = page.locator('[data-testid^="admin-users-row-"]').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.click();

  await expect(page.getByTestId('admin-users-detail')).toBeVisible();
}

/** True when the open aside shows the "Suspended" badge. */
function isSuspended(page: Page): Promise<boolean> {
  return page.getByTestId('admin-users-suspended-badge').isVisible().catch(() => false);
}

/** Click the suspend/unsuspend toggle and confirm the dialog with the given confirm-button label. */
async function toggleAndConfirm(page: Page, confirmLabel: 'Suspend' | 'Unsuspend'): Promise<void> {
  await page.getByTestId('admin-users-toggle-suspension').click();
  // confirm-dialog.tsx renders the action button with the raw confirmText as its
  // accessible name; exact match avoids colliding with "Suspend user" on the toggle.
  await page.getByRole('button', { name: confirmLabel, exact: true }).click();
}

test('@regression @admin @account suspending a user succeeds (edge fn authenticates the admin)', async ({ page }) => {
  await loginAs(page, 'admin');
  await openTeamDetail(page);

  // Normalize baseline: if a prior run left the fixture suspended, clear it first.
  if (await isSuspended(page)) {
    await toggleAndConfirm(page, 'Unsuspend');
    await expect(page.getByText(UNSUSPEND_TOAST)).toBeVisible();
    await expect(page.getByTestId('admin-users-suspended-badge')).toHaveCount(0);
  }

  try {
    // The guard: Suspend must succeed, not error out on the edge function auth path.
    await toggleAndConfirm(page, 'Suspend');
    await expect(page.getByText(SUCCESS_TOAST)).toBeVisible();
    await expect(page.getByText(FAILURE_TOAST)).toHaveCount(0);
    await expect(page.getByTestId('admin-users-suspended-badge')).toBeVisible();
  } finally {
    // Always restore so the shared fixture is never left banned for later specs.
    if (await isSuspended(page)) {
      await toggleAndConfirm(page, 'Unsuspend');
      await expect(page.getByText(UNSUSPEND_TOAST)).toBeVisible();
    }
  }
});
