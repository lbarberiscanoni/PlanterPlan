import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-16 — task numbers are zero-padded so they sort/read correctly. @regression @tasks
 *
 * Patrick reported (2026-07 review) that unpadded numbering collides "57.1" vs "57.10":
 * lexically "57.10" sorts before "57.2", and a numeric parse treats 57.1 === 57.10.
 * computeProjectTaskNumbers now zero-pads the leaf index (min 2 digits → "57.01"). This
 * guards against the padding being dropped (a leaf number with a single-digit suffix).
 */
test('@regression @tasks leaf task numbers are zero-padded', async ({ page }) => {
  await loginAs(page, 'planter');
  const name = tagged(`Numbering ${Date.now()}`);
  await createProjectFromTemplate(page, name);

  await page.goto('/tasks');

  // Switch to All Tasks (grouped view renders a mono number badge per leaf task)…
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  // …scoped to the project we just created, to isolate its numbering.
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name }).click();

  const badges = page.locator('span.font-mono');
  await expect(badges.first()).toBeVisible();

  const values = (await badges.allTextContents()).map((v) => v.trim()).filter(Boolean);
  const dotted = values.filter((v) => v.includes('.'));

  // There must be leaf numbers (C.NN), and every dotted number is zero-padded to
  // at least two digits after the dot — never the collision-prone single digit.
  expect(dotted.length).toBeGreaterThan(0);
  for (const v of dotted) {
    expect(v, `leaf number "${v}" must be zero-padded (e.g. 3.01, not 3.1)`).toMatch(/^\d+\.\d{2,}$/);
  }
});
