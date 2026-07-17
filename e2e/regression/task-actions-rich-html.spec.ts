import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-21 — task detail renders embedded HTML (links/lists) instead of literal tags. @regression @tasks
 *
 * Migrated task copy embeds `<a href>` anchors (and may carry ordered/bulleted lists) inside the
 * Purpose / Overview / Action Steps fields. The detail view used to print those fields as plain
 * text, so an anchor showed up as the raw string `<a href="...">…</a>` and links weren't clickable.
 * TaskDetailsView now rebuilds the ordered-list structure from the flattened prose (steps are
 * split on the `.  ` delimiter, the "…is complete once…" sentence becomes a closing paragraph) and
 * renders it through the sanitized-HTML `RichText` component. This guards against reverting to
 * plain-text rendering (raw markup leaking / no list) and against the anchor not becoming a real
 * link. Reported from the platform-parity screenshot (2026-07 review).
 */
test('@regression @tasks Action Steps renders embedded HTML links, not raw markup', async ({ page }) => {
  await loginAs(page, 'planter');
  const projectName = tagged(`Rich actions ${Date.now()}`);
  await createProjectFromTemplate(page, projectName);

  // Created-project tasks are future-dated, so use All Tasks (Today's Tasks would be empty),
  // scoped to this project.
  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: projectName }).click();

  // This Standard-template task carries an <a href> link inside its Action Steps copy.
  const row = page
    .getByRole('treeitem')
    .filter({ hasText: 'Describe the gospel in your context' })
    .first();
  await expect(row).toBeVisible();
  await row.click();

  const panel = page.getByTestId('task-details-panel');
  await expect(panel).toBeVisible();
  const heading = panel.getByRole('heading', { name: 'Action Steps (The What)' });
  await expect(heading).toBeVisible();

  // The action steps render as an ordered list (numbered items), not one flat paragraph.
  const link = panel.getByRole('link', { name: /Relevance Is Not/i });
  const step = link.locator('xpath=ancestor::li[1]');
  await expect(step).toBeVisible();

  // The embedded anchor must render as a real, clickable link inside that step…
  await expect(link).toHaveAttribute('href', /gccollective\.org/);
  // …opened safely (new tab, hardened rel).
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  // …and the raw markup must NOT leak into the rendered text (the pre-fix regression).
  await expect(panel).not.toContainText('<a href');
});
