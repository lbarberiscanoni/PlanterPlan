import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-15 — the Milestones view is a flat, high-level list of milestones. @regression @tasks
 *
 * Patrick asked (2026-07 review) for the Milestones view to show ONLY milestones for a
 * high-level overview — not milestones buried as leaf rows under their parent phase (the old
 * grouped rendering). This guards against the milestones view reverting to grouped sections,
 * and confirms the grouped/flat layout toggle is hidden since the view is always flat.
 */
test('@regression @tasks milestones view renders flat, not grouped under phases', async ({ page }) => {
  await loginAs(page, 'planter');
  // Guarantee at least one project with milestones exists for this run.
  await createProjectFromTemplate(page, tagged(`Milestones view ${Date.now()}`));

  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'Milestones' }).click();

  // The view is active and non-empty.
  await expect(page.locator('[aria-label="Task view"]')).toContainText('Milestones');
  await expect(page.getByText(/Showing [1-9]/)).toBeVisible();

  // The defining assertions: no milestone-grouped sections, and the layout toggle
  // (which only makes sense for grouped views) is not offered.
  await expect(page.locator('[data-testid^="task-group-"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="Group by milestone"]')).toHaveCount(0);
});
