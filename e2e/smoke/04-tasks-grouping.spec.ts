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

  // Avoid depending on whichever project a previous test left selected.
  await page.getByRole('combobox', { name: 'Filter by project' }).click();
  await page.getByRole('option', { name: 'All projects', exact: true }).click();

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

  // Milestone groups follow their persistent document numbers (1, 2, … 10),
  // not sibling-local `position` values or whichever task happens to be due first.
  const numbersByProject = new Map<string, number[][]>();
  for (let groupIndex = 0; groupIndex < await groups.count(); groupIndex++) {
    const group = groups.nth(groupIndex);
    const projectTitle = (await group.locator('p').first().textContent())?.trim() ?? '';
    const groupNumbers = (await group.locator('span.font-mono').allTextContents())
      .map((value) => value.trim())
      .filter((value) => /^\d+\.\d+$/.test(value))
      .map((value) => value.split('.').map(Number));
    numbersByProject.set(projectTitle, [...(numbersByProject.get(projectTitle) ?? []), ...groupNumbers]);
  }

  const visibleNumberCount = Array.from(numbersByProject.values()).reduce(
    (count, numbers) => count + numbers.length,
    0,
  );
  expect(visibleNumberCount, 'seeded task rows must expose their document numbers').toBeGreaterThan(1);

  for (const [projectTitle, visibleNumbers] of numbersByProject) {
    for (let i = 1; i < visibleNumbers.length; i++) {
      const [previousMilestone, previousTask] = visibleNumbers[i - 1];
      const [currentMilestone, currentTask] = visibleNumbers[i];
      expect(
        currentMilestone > previousMilestone
          || (currentMilestone === previousMilestone && currentTask >= previousTask),
        `${projectTitle} task numbers must follow milestone order, got ${visibleNumbers.map((number) => number.join('.')).join(', ')}`,
      ).toBe(true);
    }
  }
});
