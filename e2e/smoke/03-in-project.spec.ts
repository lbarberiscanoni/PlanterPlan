import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * In-project smokes. Each creates its own run-tagged project (teardown deletes the subtree),
 * so phases/tasks deterministically exist. The first phase is auto-active (Project.tsx:239),
 * so milestones/tasks render on entry without selecting a phase.
 */

// SMK-03 — both project date fields are editable in settings. The Project Due Date became
// editable in commit 131cb503 (feedback #1: editing it reflows incomplete tasks to hit the new
// finish date); it was read-only before (commit e6a4a05f). The reflow / pin-exact / due>start
// validation are guarded by REG-20 in project-duration-rescale.spec.ts — this smoke just proves
// both fields render editable. Selectors: EditProjectModal #start_date / #due_date.
test('@smoke @dates project start and due dates are both editable', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Dates ${Date.now()}`));

  await page.getByRole('button', { name: /^Open settings for / }).click();
  await expect(page.locator('#due_date')).toBeEditable(); // editable since commit 131cb503 (feedback #1)
  await expect(page.locator('#start_date')).toBeEditable();
});

// SMK-05 — task status round-trips. Uses non-completing statuses to avoid the completed-filter,
// proving the status pipeline edits + reflects reliably. (Deeper reversibility/N/A-denominator → @regression.)
test('@smoke @tasks task status edits and round-trips', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Status ${Date.now()}`));

  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  const select = firstRow.getByTestId('status-select').locator('select');

  await select.selectOption('in_progress');
  await expect(select).toHaveValue('in_progress');
  await select.selectOption('na');
  await expect(select).toHaveValue('na');
  await select.selectOption('todo');
  await expect(select).toHaveValue('todo');
});

// SMK-06 — task delete is admin-only (commit 68d2b569). delete-task-btn renders only when
// canEdit, and canDeleteTask(role) === (role === ADMIN) (task-permissions.ts:36).
test('@smoke @tasks task delete is admin-only', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectUrl = await createProjectFromTemplate(page, tagged(`Delete ${Date.now()}`));

  // Planter: open a task detail → no delete control.
  await page.locator('[data-testid^="task-row-title-"]').first().click();
  const panel = page.getByTestId('task-details-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('delete-task-btn')).toHaveCount(0);

  // Admin (global, bypasses RLS): same project → delete control present.
  await page.context().clearCookies();
  await loginAs(page, 'admin');
  await page.goto(projectUrl);
  await page.locator('[data-testid^="task-row-title-"]').first().click();
  const adminPanel = page.getByTestId('task-details-panel');
  await expect(adminPanel).toBeVisible();
  await expect(adminPanel.getByTestId('delete-task-btn')).toBeVisible();
});
