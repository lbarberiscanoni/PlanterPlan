import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-23 — the flat /tasks list tags each leaf task with its milestone. @regression @tasks
 *
 * Patrick asked (2026-07 sync) to drop the milestone "chunk" section cards in favor of a flat
 * list where the milestone rides along as a tag/bubble on each row (Asana-style), reclaiming
 * vertical space. This guards that (a) the flat layout is reachable and (b) a leaf-task row
 * under a milestone renders a milestone tag — the piece that would silently regress if the tag
 * prop stopped being threaded or the flat branch stopped passing it.
 */
test('@regression @tasks flat task rows show their milestone as a tag', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectName = tagged(`Milestone tag ${Date.now()}`);
  await createProjectFromTemplate(page, projectName);

  await page.goto('/tasks');

  // All Tasks scoped to the freshly created project (which has Phase → Milestone → Task depth).
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: projectName }).click();

  // Flat is the default layout, but click it explicitly so the assertion doesn't depend on the
  // default — the milestone tag is only rendered in the flat list (grouped uses section headers).
  await page.getByRole('button', { name: 'Flat list' }).click();

  const milestoneTag = page.locator('[data-testid^="task-row-milestone-tag-"]').first();
  await expect(milestoneTag, 'a leaf task under a milestone must show a milestone tag').toBeVisible();
});
