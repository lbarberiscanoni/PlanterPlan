import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-14 — template authoring UI is admin-only. @regression @templates
 *
 * Patrick asked (2026-07 review) to remove template-management entry points from the regular
 * planter interface — only P4P admins create/manage templates. Planters still start projects
 * FROM templates via the create-project picker; that path must stay open. This guards the
 * sidebar "New Template" button + template lists being admin-gated, while "New Project"
 * remains available to planters from the compact header project switcher.
 */
test('@regression @templates planters see no template-management UI', async ({ page }) => {
  await loginAs(page, 'planter');

  // The template-authoring button is gone for planters…
  await expect(page.getByTestId('sidebar-new-template-btn')).toHaveCount(0);
  // The low-frequency project controls and project lists are gone from the sidebar.
  await expect(page.getByTestId('sidebar-new-project-btn')).toHaveCount(0);
  await expect(page.getByText('My Projects', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Joined Projects', { exact: true })).toHaveCount(0);

  // …but planters can still start projects from Switch Project.
  await page.getByTestId('project-switcher-trigger').click();
  await expect(page.getByTestId('project-switcher-new-project')).toBeVisible();

  // A hand-typed / stale template-authoring URL opens nothing for a planter.
  await page.goto('/tasks?action=new-template');
  await expect(page.getByTestId('project-switcher-trigger')).toBeVisible(); // page rendered
  await expect(page.getByTestId('create-template-modal')).toHaveCount(0);

  // The create-PROJECT flow still offers templates to planters.
  await page.getByTestId('project-switcher-trigger').click();
  await page.getByTestId('project-switcher-new-project').click();
  await expect(page.getByTestId('create-project-modal')).toBeVisible();
  await expect(
    page.locator('[data-testid="template-card"]:not([data-template-id="__default__"])').first(),
  ).toBeVisible();
});

test('@regression @templates admins keep the template-management UI', async ({ page }) => {
  await loginAs(page, 'admin');

  await expect(page.getByTestId('sidebar-new-template-btn')).toBeVisible();
});
