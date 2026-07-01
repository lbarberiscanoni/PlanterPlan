import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { tagged } from '../support/runId';

/**
 * REG-10 — a loose Master Library item (a phase/task saved with parent_task_id = NULL)
 * must NOT appear in the /admin/templates roots list. @regression @admin @library
 *
 * Guards Tim's 2026-06-30 review: "if it's supposed to be a phase, it shouldn't appear
 * as a template — only the top-level template item should." Loose items are created on
 * purpose in /admin/library (CreateLibraryItemDialog) and belong there; the bug was that
 * admin_template_roots() / listTemplates() listed every parent-less template row, so those
 * loose phases/tasks masqueraded as project templates.
 * Fixed by adding COALESCE(task_type,'project')='project' to admin_template_roots (migration
 * 20260630000000) and to TaskWithResources.listTemplates (planterClient.ts).
 */
test('@regression @admin @library loose library item is absent from the templates list', async ({ page }) => {
  await loginAs(page, 'admin');

  const title = tagged(`Loose Phase ${Date.now()}`);

  // Create a loose library item. The dialog defaults its type to "phase", which is
  // exactly the parent-less, non-project row the bug surfaced as a template.
  await page.goto('/admin/library');
  await page.getByTestId('admin-library-add').click();
  const dialog = page.getByTestId('create-library-item-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#title').fill(title);
  await dialog.locator('form[data-testid="task-form"] button[type="submit"]').click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  // Positive control: it DOES belong in the loose-items library list.
  await expect(page.getByTestId('admin-library-table').getByText(title, { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // The fix: it must NOT show up among project-template roots.
  await page.goto('/admin/templates');
  await expect(page.getByTestId('admin-templates-table')).toBeVisible();
  await expect(page.getByTestId('admin-templates-table').getByText(title, { exact: true })).toHaveCount(0);
});
