import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate, addDays } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-20 — editing the project due date reflows incomplete tasks to hit it. @regression @dates
 *
 * Feedback item #1 (2026-07 review): a planter sets the project's total duration by editing
 * the (now-editable) Project Due Date; rescale_project_incomplete reflows the incomplete tasks
 * proportionally so the last one lands EXACTLY on the chosen date (completed tasks frozen). The
 * derived project due therefore equals the target after the save. Guards the field staying
 * editable and the pin-exact rescale.
 *
 * NOTE: requires migration 20260708000000_rescale_project_incomplete applied to the target DB.
 */
test('@regression @dates editing the project due date rescales to land on it', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Rescale ${Date.now()}`));

  await page.getByRole('button', { name: /^Open settings for / }).click();
  const startIso = await page.locator('#start_date').inputValue();
  const dueField = page.locator('#due_date');
  const originalDue = await dueField.inputValue();
  test.skip(!startIso || !originalDue, 'project has no derived dates to rescale');

  // The due date must be editable (was read-only before this feature).
  await expect(dueField).toBeEnabled();

  // Retarget to a fresh brand-new date well after the start (fresh template = all
  // tasks incomplete, so the anchor is the project start).
  const target = addDays(startIso, 140);
  await dueField.fill(target);
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByTestId('edit-project-modal')).toBeHidden(); // save fully resolved

  // Reopen: the derived project due must now equal the chosen target exactly (pinned end).
  await page.getByRole('button', { name: /^Open settings for / }).click();
  await expect(page.locator('#due_date')).toHaveValue(target);
});

/**
 * REG-20b — the project due date must be after the start date. @regression @dates
 * A due before start is rejected client-side (never reaches the rescale RPC).
 */
test('@regression @dates project due date before start is rejected', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Rescale guard ${Date.now()}`));

  await page.getByRole('button', { name: /^Open settings for / }).click();
  const startIso = await page.locator('#start_date').inputValue();
  test.skip(!startIso, 'project has no start date');

  await page.locator('#due_date').fill(addDays(startIso, -30));
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // Validation blocks it: error shown, modal stays open.
  await expect(page.getByText('The due date must be after the project start date.')).toBeVisible();
  await expect(page.getByTestId('edit-project-modal')).toBeVisible();
});
