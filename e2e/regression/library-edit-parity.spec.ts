import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-03 — library-item edit form has purpose / actions / notes / duration. @regression @library
 * Guards commit 5cd73d6c #5: the ADD form had these fields but the EDIT form dropped them
 * (add/edit parity bug). Their mere presence in the edit panel IS the assertion — so this
 * opens an existing item read-only (no save → no mutation of real template data).
 * Selectors: AdminLibrary.tsx admin-library-row-* / admin-library-panel / admin-library-form-*.
 */
test('@regression @library edit panel exposes purpose/actions/notes/duration', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin/library');

  const firstRow = page.locator('[data-testid^="admin-library-row-"]').first();
  await expect(firstRow, 'the master library must have at least one item').toBeVisible();
  await firstRow.click();

  const panel = page.getByTestId('admin-library-panel');
  await expect(panel).toBeVisible();

  for (const field of ['purpose', 'actions', 'notes', 'duration'] as const) {
    await expect(
      panel.getByTestId(`admin-library-form-${field}`),
      `"${field}" missing from the edit form — add/edit parity regression`,
    ).toBeVisible();
  }
});
