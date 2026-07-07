import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-11 — the first-run "Use Standard Church Plant template" CTA resolves to a REAL
 * template, not the blank scaffold. @regression @templates
 *
 * The CTA links to /tasks?action=new-project&template=launch_large. CreateProjectModal
 * resolves that seed key against settings.seed_key (getTemplateSeedKey). The imported
 * template originally carried no seed_key, so the lookup returned null and the modal
 * silently fell back to DEFAULT_SCAFFOLD_ID ('__default__') — the blank 6-phase scaffold.
 * Guards migration 20260707010000 (stamps seed_key='launch_large' on the template root):
 * the modal must preselect a non-default template card.
 */
test('@regression @templates first-run template CTA preselects a real template', async ({ page }) => {
  await loginAs(page, 'planter');

  // Hit the CTA target directly (empty-state only renders with zero projects).
  await page.goto('/tasks?action=new-project&template=launch_large');

  const modal = page.getByTestId('create-project-modal');
  await expect(modal).toBeVisible();

  // The modal opens on step 2 (details); step back to the picker to read the selection.
  await modal.getByRole('button', { name: 'Back' }).click();

  // The seed key must resolve to a real template, NOT the blank scaffold.
  const selectedDefault = modal.locator(
    '[data-testid="template-card"][data-template-id="__default__"][data-selected="true"]',
  );
  await expect(selectedDefault).toHaveCount(0);

  const selectedReal = modal.locator(
    '[data-testid="template-card"]:not([data-template-id="__default__"])[data-selected="true"]',
  );
  await expect(selectedReal).toHaveCount(1);
});
