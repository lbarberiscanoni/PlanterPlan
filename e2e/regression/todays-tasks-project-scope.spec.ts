import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-17 — the /tasks page defaults its project scope to the current project. @regression @tasks
 *
 * Patrick asked (2026-07 review) for the Today's Tasks page to default to showing tasks from
 * the CURRENT project, with "All projects" one click away — not the cross-project firehose.
 * The scope selector now initializes from the persisted/first project instead of null (all).
 * This guards against it reverting to defaulting to "All projects", while confirming the
 * all-projects escape hatch still works.
 */
test('@regression @tasks tasks page defaults to a single project, with an All-projects opt-out', async ({ page }) => {
  await loginAs(page, 'planter');
  // Guarantee the planter has at least one project so a current project resolves.
  await createProjectFromTemplate(page, tagged(`Scope default ${Date.now()}`));

  await page.goto('/tasks');

  // The project-scope selector defaults to a specific project, NOT "All projects".
  const scope = page.locator('[aria-label="Filter by project"]');
  await expect(scope).toBeVisible();
  await expect(scope).not.toContainText('All projects');

  // "All projects" is still available and switches the scope.
  await scope.click();
  await page.getByRole('option', { name: 'All projects' }).click();
  await expect(scope).toContainText('All projects');
});
