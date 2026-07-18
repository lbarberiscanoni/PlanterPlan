import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-19 — editing an instance task is DUE-date authoritative. @regression @tasks
 *
 * Patrick asked (2026-07 review) that users set a task's DUE date (when it must be done),
 * with the start date derived from its duration and the duration itself hidden. The instance
 * task form now shows a Due Date field (no Start Date field); on save the app back-solves
 * start = due - length and the DB trigger re-derives due, so the chosen due persists exactly.
 * This guards against the field reverting to Start Date and against the due not sticking.
 */
test('@regression @tasks instance task form edits the due date and it persists', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectName = tagged(`Due authoritative ${Date.now()}`);
  await createProjectFromTemplate(page, projectName);

  // The created project's tasks are future-dated, so use All Tasks (Today's Tasks would be
  // empty) scoped to this project.
  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: projectName }).click();

  // Task rows open in read mode. Explicitly choose Edit before changing dates.
  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page.getByTestId('task-details-schedule')).toBeVisible();
  await page.getByTestId('edit-task-btn').click();

  const form = page.getByTestId('task-form');
  await expect(form).toBeVisible();

  // Due-authoritative: a Due Date field is present, and the old Start Date field is gone.
  const due = page.locator('#due_date');
  await expect(due).toBeVisible();
  await expect(page.locator('#start_date')).toHaveCount(0);

  // Set a new due date and save. The edit form closes on success, but the panel stays open in
  // its (modal) details view for the same task — see TasksPage.tsx handleTaskSubmit, which clears
  // taskFormState but keeps selectedTask.
  const newDue = '2027-06-15';
  await due.fill(newDue);
  await form.getByRole('button', { name: 'Save Changes' }).click();
  await expect(form).toBeHidden();

  // The details panel is a Radix Dialog (aria-modal) that makes the task list behind it inert, so
  // reopening a treeitem is impossible until the panel is closed. Close it first.
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByTestId('task-details-panel')).toBeHidden();

  // Reopen the same first row (All Tasks orders by serial number, so first row == same task) — the
  // chosen due date must have persisted through the save + refetch.
  await page.getByRole('treeitem').first().click();
  await page.getByTestId('edit-task-btn').click();
  await expect(page.locator('#due_date')).toHaveValue(newDue);
});
