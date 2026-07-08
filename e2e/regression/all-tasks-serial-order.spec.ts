import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-18 — the All Tasks view orders tasks by milestone/serial number. @regression @tasks
 *
 * Patrick reported (2026-07 review) that the All Tasks list was date-jumbled: rows did not
 * follow their serial numbers, and "x.10" collided with "x.1". Within each milestone group,
 * rows now sort by document/serial order so they render 3.01, 3.02, … 3.09, 3.10 in sequence.
 * This guards against the within-group order regressing to due-date-first.
 */
test('@regression @tasks All Tasks renders each milestone in ascending serial order', async ({ page }) => {
  await loginAs(page, 'planter');
  const name = tagged(`Serial order ${Date.now()}`);
  await createProjectFromTemplate(page, name);

  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name }).click();

  const groups = page.locator('[data-testid^="task-group-"]');
  await expect(groups.first()).toBeVisible();

  const groupCount = await groups.count();
  let sawLeafNumbers = false;

  for (let i = 0; i < groupCount; i++) {
    const badges = await groups.nth(i).locator('span.font-mono').allTextContents();
    // Leaf numbers look like "C.NN"; extract the numeric leaf index in render order.
    const leaves = badges
      .map((b) => b.trim().split('.'))
      .filter((parts) => parts.length === 2)
      .map((parts) => Number.parseInt(parts[1], 10));

    if (leaves.length > 1) {
      sawLeafNumbers = true;
      for (let j = 1; j < leaves.length; j++) {
        expect(
          leaves[j],
          `group ${i} leaf numbers must be non-decreasing (serial order), got ${badges.join(', ')}`,
        ).toBeGreaterThanOrEqual(leaves[j - 1]);
      }
    }
  }

  // The assertion above is only meaningful if at least one multi-task milestone rendered.
  expect(sawLeafNumbers, 'expected at least one milestone with multiple numbered tasks').toBe(true);
});
