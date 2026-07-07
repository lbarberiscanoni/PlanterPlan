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

/**
 * REG-10 — the chosen project start date is honored exactly (no +1 day). @regression @dates
 * Guards migration 20260707000000: the "Standard Church Plant" template was imported with 1-based
 * day offsets (earliest task = day 1) while the clone engine seeds leaf start = anchor + days_from_start
 * (0-based). Left unnormalized, a project anchored at 2027-01-15 started 2027-01-16 — the root
 * start_date rolls up to min(children) = anchor + 1. Fixed by normalizing the template to 0-based.
 */
test('@regression @dates cloned project start matches the chosen start date', async ({ page }) => {
  const anchor = '2027-01-15';
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Anchor ${Date.now()}`), anchor);

  await page.getByRole('button', { name: /^Open settings for / }).click();
  // Root start_date is a roll-up of the earliest task; with a 0-based template it must equal
  // the anchor exactly. Pre-fix this read one day later (2027-01-16).
  await expect(page.locator('#start_date')).toHaveValue(anchor);
});

/**
 * REG-09 — calendar dates render their true stored day in a behind-UTC timezone. @regression @dates
 * Guards Tim's "task/project date shows one day early" report (2026-06-30 review): due/start dates are
 * stored as UTC-midnight timestamps, so the header + badges must format them as the UTC calendar day,
 * not the runtime-local day. Before the fix, a due date of e.g. Jul 13 rendered "Jul 12" west of UTC.
 * Fixed by formatCalendarDate (src/shared/lib/date-engine/index.ts).
 */
test.describe('calendar-date display is timezone-stable', () => {
  // Force a timezone well behind UTC — a UTC-midnight date formatted in local time
  // would fall back onto the previous calendar day here (the bug).
  test.use({ timezoneId: 'America/Los_Angeles' });

  test('@regression @dates project due date is not off-by-one west of UTC', async ({ page }) => {
    await loginAs(page, 'planter');
    await createProjectFromTemplate(page, tagged(`TZ display ${Date.now()}`));

    // The canonical stored calendar day is exposed (read-only) in the due-date field.
    await page.getByRole('button', { name: /^Open settings for / }).click();
    const iso = await page.locator('#due_date').inputValue(); // "YYYY-MM-DD"
    test.skip(!/^\d{4}-\d{2}-\d{2}$/.test(iso), 'project has no derived due date');
    const [y, m, d] = iso.split('-').map(Number);
    const expected = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }); // e.g. "Jul 13, 2026"
    await page.getByTestId('edit-project-modal').getByRole('button', { name: 'Cancel' }).click();

    // Header must show that exact calendar day — pre-fix it showed the day before.
    await expect(page.getByText(`Due: ${expected}`)).toBeVisible();
  });
});
