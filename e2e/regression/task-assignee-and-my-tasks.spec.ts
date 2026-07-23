import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-22 — task delegation + project-scoped "My Tasks". @regression @tasks
 *
 * Stakeholders needed a way to delegate work: an "Assigned to" picker (project members) on the
 * task form persisting `tasks.assignee_id`, plus a "My Tasks" view scoped to the focused project
 * (it was previously cross-project and hid the project selector). This guards both halves —
 * assigning a member sticks and surfaces in the read view, and My Tasks, scoped to the project,
 * lists the task assigned to the logged-in user. Reported from the 2026-07 platform-parity review.
 */
test('@regression @tasks assign a task to a member and see it in project-scoped My Tasks', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectName = tagged(`Assignee ${Date.now()}`);
  await createProjectFromTemplate(page, projectName);

  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: projectName }).click();

  // Task rows open in read mode. Explicitly choose Edit before assigning it.
  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  // Capture just the title (not the whole row text) so later `hasText` matching is stable even
  // as the row gains an assignee chip / other badges.
  const taskTitle = (await firstRow.locator('[data-testid^="task-row-title-"]').textContent())?.trim() ?? '';
  await firstRow.click();
  await expect(page.getByTestId('task-details-schedule')).toBeVisible();
  await page.getByTestId('edit-task-btn').click();

  const form = page.getByTestId('task-form');
  await expect(form).toBeVisible();

  // The "Assigned to" picker lists project members. A freshly cloned project has exactly one
  // member — its creator (this planter) — so the only non-"Unassigned" option is us. Assign it.
  await form.getByRole('combobox', { name: 'Assigned to' }).click();
  const memberOption = page.getByRole('option').filter({ hasNotText: 'Unassigned' }).first();
  await expect(memberOption).toBeVisible();
  await memberOption.click();
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(form).toBeHidden();

  // The read view now shows an "Assigned To" badge (not "Unassigned").
  const panel = page.getByTestId('task-details-panel');
  const assignedGroup = panel.locator('div').filter({ has: panel.getByText('Assigned To', { exact: true }) }).last();
  await expect(assignedGroup).toBeVisible();
  await expect(assignedGroup).not.toContainText('Unassigned');

  // Close the panel, switch to My Tasks, and scope to this project (the project selector is now
  // shown for My Tasks — it used to be hidden because the view was cross-project).
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(panel).toBeHidden();

  // The delegation is now visible WITHOUT opening the task: an assignee chip renders on the row
  // itself (2026-07 sync — Patrick/Timothy wanted to see who's assigned while scanning the list).
  // This freshly cloned project has exactly one assignment, so a single chip must be present.
  await expect(page.locator('[data-testid^="task-row-assignee-"]').first()).toBeVisible();

  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'My Tasks' }).click();

  const projectScope = page.locator('[aria-label="Filter by project"]');
  await expect(projectScope, 'project scope selector must be visible for My Tasks').toBeVisible();
  await projectScope.click();
  await page.getByRole('option', { name: projectName }).click();

  // The task we assigned to ourselves shows up in the project-scoped My Tasks list.
  await expect(page.getByRole('treeitem').filter({ hasText: taskTitle })).toBeVisible();
});
