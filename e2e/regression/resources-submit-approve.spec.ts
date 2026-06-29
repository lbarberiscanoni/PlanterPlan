import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { tagged } from '../support/runId';

/**
 * REG-05 — Resource submission + approval workflow. @regression @resources
 * Guards commit 242b62ad (Patrick/Tim Batch C).
 *
 * Nuance: a submitted resource must be HIDDEN from the catalog until an admin approves it,
 * and only admins see/act on the pending queue. Selectors verified in Resources.tsx.
 */
test('@regression @resources submit → hidden from catalog → admin approves → appears', async ({ page }) => {
  const name = tagged(`Resource ${Date.now()}`);

  // --- Planter submits a suggestion ---
  await loginAs(page, 'planter');
  await page.goto('/resources');
  await page.getByTestId('resources-suggest').click();

  const form = page.getByTestId('resources-form-dialog');
  await expect(form).toBeVisible();
  await form.getByTestId('resources-form-name').locator('input, textarea').first().fill(name);
  await form.getByTestId('resources-form-url').locator('input').first().fill('https://example.com/e2e');
  await page.getByTestId('resources-form-save').click();

  await expect(page.getByText(/Submitted for review/i)).toBeVisible();
  // Hidden from the approved catalog (planter is not an admin → no pending queue either).
  await expect(page.getByTestId('resources-table').getByText(name)).toHaveCount(0);
  await expect(page.getByTestId('resources-pending')).toHaveCount(0);

  // --- Admin approves from the pending queue ---
  await page.context().clearCookies();
  await loginAs(page, 'admin');
  await page.goto('/resources');

  const pending = page.getByTestId('resources-pending');
  await expect(pending).toBeVisible();
  const pendingRow = pending.locator('[data-testid^="resources-pending-row-"]').filter({ hasText: name });
  await expect(pendingRow).toBeVisible();
  await pendingRow.locator('[data-testid^="resources-approve-"]').click();

  await expect(page.getByText(/approved and published/i)).toBeVisible();
  // Now in the approved catalog, gone from pending.
  await expect(page.getByTestId('resources-table').getByText(name)).toBeVisible();
  await expect(pending.locator('[data-testid^="resources-pending-row-"]').filter({ hasText: name })).toHaveCount(0);
});
