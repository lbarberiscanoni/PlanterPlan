import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-13 — the /tasks page defaults to the "Today's Tasks" view. @regression @tasks
 *
 * Patrick asked (2026-07 review) to rename the "Priority" view to "Today's Tasks" and make
 * it the landing view instead of the full "All Tasks" backlog. The internal filter key stays
 * `priority`; only the label and the default changed. This guards against the default
 * reverting to `all_tasks` or the label regressing to "Priority".
 */
test("@regression @tasks tasks page lands on the Today's Tasks view", async ({ page }) => {
  await loginAs(page, 'planter');
  // loginAs already lands on /tasks.

  // The page heading reflects the active view.
  await expect(page.getByRole('heading', { name: "Today's Tasks", level: 1 })).toBeVisible();

  // The View selector shows the renamed view as its value…
  const viewSelect = page.locator('[aria-label="Task view"]');
  await expect(viewSelect).toContainText("Today's Tasks");

  // …and the old "Priority" label is gone from the options list.
  await viewSelect.click();
  await expect(page.getByRole('option', { name: "Today's Tasks" })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Priority', exact: true })).toHaveCount(0);
});
