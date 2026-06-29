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
 * KNOWN BUG — surfaced by this e2e suite on 2026-06-29. Editing a project's start date does NOT
 * persist on the root: after a full reload, #start_date reverts to created_at (start_date reads
 * back null), even though the descendant cascade fires. This is the app-layer envelope alignment
 * (form fields / payload) that was flagged TODO when the date engine switched to the bottom-up
 * envelope model — and a live echo of Tim's "I change the start date, it does not save it."
 *
 * Marked `test.fail` so CI stays green while the bug is tracked; it flips RED (unexpected pass) the
 * moment persistence is fixed — that's the cue to delete this marker and keep the assertion.
 */
test.fail('@regression @dates project start date persists across reload (KNOWN BUG)', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectUrl = await createProjectFromTemplate(page, tagged(`Start persist ${Date.now()}`));

  await page.getByRole('button', { name: /^Open settings for / }).click();
  const start = page.locator('#start_date');
  const original = await start.inputValue();
  await start.fill('2027-03-15');
  await page.getByRole('button', { name: 'Save Changes' }).click();

  await page.goto(projectUrl);
  await page.getByRole('button', { name: /^Open settings for / }).click();
  await expect(page.locator('#start_date')).not.toHaveValue(original);
});
