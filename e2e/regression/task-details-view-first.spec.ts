import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

async function showAllTasks(page: import('@playwright/test').Page) {
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: 'All projects', exact: true }).click();
}

/**
 * REG-28 — task rows and deep links open the read view first. @regression @tasks
 *
 * The read view puts schedule and progress first so a user can understand a task
 * and update its status without entering the full edit form.
 */
test('@regression @tasks task opens in read view with schedule and editable status first', async ({ page }) => {
  await loginAs(page, 'planter');
  await page.goto('/tasks');
  await showAllTasks(page);

  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  const taskTitle = (await firstRow.locator('[data-testid^="task-row-title-"]').textContent())?.trim()
    ?? (await firstRow.textContent())?.trim()
    ?? '';
  await firstRow.click();

  const panel = page.getByTestId('task-details-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('task-form')).toHaveCount(0);
  await expect(panel.getByTestId('edit-task-btn')).toBeVisible();

  const schedule = panel.getByTestId('task-details-schedule');
  await expect(schedule).toBeVisible();
  await expect(schedule.getByText('Start Date', { exact: true })).toBeVisible();
  await expect(schedule.getByText('Due Date', { exact: true })).toBeVisible();

  const status = schedule.getByRole('combobox', { name: `Status for ${taskTitle}` });
  await expect(status).toBeVisible();
  await expect(status).toBeEnabled();
  await expect(status.locator('option')).toHaveCount(5);

  const firstNarrativeHeading = panel.locator('h3').filter({
    hasText: /^(PURPOSE \(The Why\)|OVERVIEW \(The What\)|ACTIONS STEPS \(The How\))$/,
  }).first();
  if (await firstNarrativeHeading.count()) {
    const scheduleBox = await schedule.boundingBox();
    const headingBox = await firstNarrativeHeading.boundingBox();
    expect(scheduleBox?.y).toBeLessThan(headingBox?.y ?? Number.POSITIVE_INFINITY);
  }

  // Editing remains available, but only after the explicit second action.
  await panel.getByTestId('edit-task-btn').click();
  await expect(page.getByTestId('task-form')).toBeVisible();
});

test('@regression @tasks task deep link also opens the read view first', async ({ page }) => {
  await loginAs(page, 'planter');
  await page.goto('/tasks');
  await showAllTasks(page);

  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();
  await expect(page).toHaveURL(/\?task=/);
  const taskUrl = page.url();

  await page.reload();
  await page.goto(taskUrl);
  await expect(page.getByTestId('task-details-panel')).toBeVisible();
  await expect(page.getByTestId('task-details-schedule')).toBeVisible();
  await expect(page.getByTestId('task-form')).toHaveCount(0);
});
