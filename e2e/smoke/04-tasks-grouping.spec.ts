import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * SMK-04 + INV-02 — /tasks milestone grouping, no dominant catch-all bucket. @smoke
 *
 * Verified selectors (TasksPage.tsx, priority-tasks.ts):
 *   group section: [data-testid^="task-group-"], heading #priority-group-heading-<id>
 *   catch-all group title is the literal "Other" (priority-tasks.ts:158)
 *   task rows: [data-testid^="task-row-"]
 *   layout toggle: aria-label "Group by milestone" / "Flat list"
 *
 * Lenient by design: the planter account may have little/no data on a given env, so we only
 * fail on the actual regression — a catch-all "Other" group that dominates the page.
 */
test('@smoke @tasks /tasks groups by milestone with no dominant "Other" bucket', async ({ page }) => {
  await loginAs(page, 'planter');
  await expect(page).toHaveURL(/\/tasks/);

  // Grouped layout is the default; confirm the toggle exists and grouped is the active mode.
  const grouped = page.getByRole('button', { name: 'Group by milestone' });
  await expect(grouped).toHaveAttribute('aria-pressed', 'true');

  const groups = page.locator('[data-testid^="task-group-"]');
  const rows = page.locator('[data-testid^="task-row-"]');

  const rowCount = await rows.count();
  test.skip(rowCount === 0, 'no tasks visible for the planter account in this environment');

  // The catch-all (if present) must not hold the bulk of tasks — that was the "Other"/row-cap bug.
  const otherHeading = page.getByRole('heading', { name: /^Other$/ });
  if (await otherHeading.count()) {
    const otherGroup = page
      .locator('[data-testid^="task-group-"]')
      .filter({ has: page.getByRole('heading', { name: /^Other$/ }) });
    const otherRows = await otherGroup.locator('[data-testid^="task-row-"]').count();
    expect(
      otherRows,
      `"Other" holds ${otherRows}/${rowCount} tasks — looks like the catch-all/row-cap regression`,
    ).toBeLessThan(rowCount * 0.5);
  }

  expect(await groups.count()).toBeGreaterThan(0);
});
