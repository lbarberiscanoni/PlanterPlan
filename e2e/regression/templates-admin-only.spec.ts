import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-14 — template authoring UI is admin-only. @regression @templates
 *
 * Patrick asked (2026-07 review) to remove template-management entry points from the regular
 * planter interface — only P4P admins create/manage templates. Planters still start projects
 * FROM templates via the create-project picker; that path must stay open. This guards the
 * sidebar "New Template" button + template lists being admin-gated, while the "New Project"
 * button and the create-project template picker remain available to planters.
 */
test('@regression @templates planters see no template-management UI', async ({ page }) => {
  await loginAs(page, 'planter');

  // The template-authoring button is gone for planters…
  await expect(page.getByTestId('sidebar-new-template-btn')).toHaveCount(0);
  // …but they can still start projects.
  await expect(page.getByTestId('sidebar-new-project-btn')).toBeVisible();

  // A hand-typed / stale template-authoring URL opens nothing for a planter.
  await page.goto('/tasks?action=new-template');
  await expect(page.getByTestId('sidebar-new-project-btn')).toBeVisible(); // page rendered
  await expect(page.getByTestId('create-template-modal')).toHaveCount(0);

  // The create-PROJECT flow still offers templates to planters.
  await page.getByTestId('sidebar-new-project-btn').click();
  await expect(page.getByTestId('create-project-modal')).toBeVisible();
  await expect(
    page.locator('[data-testid="template-card"]:not([data-template-id="__default__"])').first(),
  ).toBeVisible();
});

test('@regression @templates admins keep the template-management UI', async ({ page }) => {
  await loginAs(page, 'admin');

  await expect(page.getByTestId('sidebar-new-template-btn')).toBeVisible();
});
