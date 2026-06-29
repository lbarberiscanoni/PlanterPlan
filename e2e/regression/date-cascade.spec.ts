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

  await page.getByRole('button', { name: /Settings for/i }).click();
  const start = page.locator('#start_date');
  const current = await start.inputValue();
  test.skip(!current, 'project has no start date set');
  await start.fill(addDays(current, 60));
  await page.getByRole('button', { name: 'Save Changes' }).click();

  // The descendant due badge must change — if it doesn't, that's Tim's bug.
  await expect(page.locator('[data-testid^="task-row-due-badge-"]').first()).not.toHaveText(before, {
    timeout: 20_000,
  });
});
