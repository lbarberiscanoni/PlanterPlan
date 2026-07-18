import { test, expect, type Locator, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';

type GroupSnapshot = {
  title: string;
  taskTitles: string[];
  dueDates: Array<string | null>;
};

const snapshotGroups = async (page: Page): Promise<GroupSnapshot[]> => {
  const groups = page.locator('[data-testid^="task-group-"]');
  const snapshots: GroupSnapshot[] = [];

  for (let index = 0; index < await groups.count(); index++) {
    const group: Locator = groups.nth(index);
    const dueBadges = group.locator('[data-testid^="task-row-due-badge-"]');
    snapshots.push({
      title: (await group.locator('h2').textContent())?.trim() ?? '',
      taskTitles: (await group.locator('[data-testid^="task-row-title-"]').allTextContents())
        .map((title) => title.trim()),
      dueDates: await dueBadges.evaluateAll((badges) =>
        badges.map((badge) => badge.getAttribute('data-due-date')),
      ),
    });
  }

  return snapshots;
};

const expectNondecreasing = (values: number[], message: string) => {
  for (let index = 1; index < values.length; index++) {
    expect(values[index], message).toBeGreaterThanOrEqual(values[index - 1]);
  }
};

test('@regression @tasks My Tasks grouped layout honors Chronological and Alphabetical sort', async ({ page }) => {
  await loginAs(page, 'planter');

  await page.getByRole('combobox', { name: 'Task view' }).click();
  await page.getByRole('option', { name: 'My Tasks', exact: true }).click();
  await page.getByRole('combobox', { name: 'Filter by project' }).click();
  await page.getByRole('option', { name: "Patrick's TEST Project 2026-07-07", exact: true }).click();

  const groups = page.locator('[data-testid^="task-group-"]');
  await expect(groups.first()).toBeVisible();
  expect(await groups.count()).toBeGreaterThan(1);

  const chronological = await snapshotGroups(page);
  const groupEarliestDates = chronological.map((group) => {
    const dates = group.dueDates.filter((date): date is string => date !== null).map(Date.parse);
    return dates.length > 0 ? Math.min(...dates) : Number.POSITIVE_INFINITY;
  });
  expectNondecreasing(groupEarliestDates, 'milestone groups must be chronological by earliest task due date');
  for (const group of chronological) {
    const dates = group.dueDates.map((date) => date ? Date.parse(date) : Number.POSITIVE_INFINITY);
    expectNondecreasing(dates, `${group.title} rows must be chronological`);
  }

  await page.getByRole('combobox', { name: 'Sort order' }).click();
  await page.getByRole('option', { name: 'Alphabetical', exact: true }).click();

  const alphabetical = await snapshotGroups(page);
  const groupTitles = alphabetical.map((group) => group.title);
  expect(groupTitles).toEqual([...groupTitles].sort((a, b) => a.localeCompare(b)));
  for (const group of alphabetical) {
    expect(group.taskTitles).toEqual([...group.taskTitles].sort((a, b) => a.localeCompare(b)));
  }

  expect(
    alphabetical.map((group) => group.title),
    'changing the sort menu must visibly reorder grouped milestones',
  ).not.toEqual(chronological.map((group) => group.title));
});
