import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { tagged } from '../support/runId';

/**
 * SMK-02 — Template → clone → live project (the core loop). @smoke
 *
 * Verified flow (CreateProjectModal.tsx):
 *   open: [data-testid="sidebar-new-project-btn"]
 *   modal: [data-testid="create-project-modal"]
 *   step 1: pick a real template card [data-testid="template-card"][data-template-id != "__default__"]
 *           then "Continue to Details" (continue_to_details)
 *   step 2: fill #title, click "Create Project"
 *
 * The project title is run-tagged so globalTeardown deletes the whole cloned subtree.
 */
test('@smoke clone a template into a new project', async ({ page }) => {
  await loginAs(page, 'planter');

  const projectName = tagged(`Clone smoke ${Date.now()}`);

  await page.getByTestId('sidebar-new-project-btn').click();
  const modal = page.getByTestId('create-project-modal');
  await expect(modal).toBeVisible();

  // Pick the first REAL template (exclude the blank/default scaffold) → tests clone, not scratch.
  const realTemplate = modal
    .locator('[data-testid="template-card"]:not([data-template-id="__default__"])')
    .first();
  await expect(realTemplate, 'a clonable template must exist in this environment').toBeVisible();
  await realTemplate.click();

  await modal.getByRole('button', { name: 'Continue to Details' }).click();

  await modal.locator('#title').fill(projectName);
  await modal.getByRole('button', { name: 'Create Project' }).click();

  // Modal closes and the new (tagged) project surfaces in the app (sidebar/header/scope).
  await expect(modal).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(projectName).first()).toBeVisible({ timeout: 20_000 });
});
