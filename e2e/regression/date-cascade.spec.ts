import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate, addDays } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-08 — editing the project start date shifts descendant dates. @regression @dates
 * Guards commit e6a4a05f (and Tim's "changing dates doesn't affect the tasks" report).
 * Observed via a task's due badge (task-row-due-badge-*): shifting start must move it.
 */
test('@regression @dates editing project start shifts descendant due dates', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Cascade ${Date.now()}`));

  const badge = page.locator('[data-testid^="task-row-due-badge-"]').first();
  test.skip((await badge.count()) === 0, 'no dated task visible to observe cascade');
  const before = ((await badge.textContent()) ?? '').trim();

  await page.getByRole('button', { name: /^Open settings for / }).click();
  const start = page.locator('#start_date');
  const current = await start.inputValue();
  test.skip(!current, 'project has no start date set');
  await start.fill(addDays(current, 60));
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // The descendant due badge must change — if it doesn't, that's Tim's bug.
  // NOTE: this checks the cascade WITHOUT a reload, so it verifies the on-save recompute, not DB
  // persistence — the persistence gap is the test.fail below.
  await expect(page.locator('[data-testid^="task-row-due-badge-"]').first()).not.toHaveText(before, {
    timeout: 20_000,
  });
});

/**
 * REG-08b — editing the project start date PERSISTS across a reload. @regression @dates
 *
 * The save runs two awaited calls (Project.update, then the reschedule_project_start RPC), so the
 * test MUST wait for the save to finish before navigating — otherwise page.goto aborts the in-flight
 * reschedule and the change appears not to persist (that was a test race, not an app bug; the DB
 * confirms reschedule_project_start persists correctly). The edit modal only closes after the
 * mutation resolves, so wait for it to be hidden before reloading.
 */
test('@regression @dates project start date persists across reload', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectUrl = await createProjectFromTemplate(page, tagged(`Start persist ${Date.now()}`));

  await page.getByRole('button', { name: /^Open settings for / }).click();
  const start = page.locator('#start_date');
  const original = await start.inputValue();
  await start.fill('2027-03-15');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByTestId('edit-project-modal')).toBeHidden(); // save fully resolved

  await page.goto(projectUrl);
  await page.getByRole('button', { name: /^Open settings for / }).click();
  await expect(page.locator('#start_date')).not.toHaveValue(original);
});
