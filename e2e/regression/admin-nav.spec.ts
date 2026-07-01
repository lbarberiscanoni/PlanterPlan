import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG-11 — the admin shell no longer exposes a "Tasks" tab. @regression @admin
 *
 * Patrick asked to drop the redundant admin Tasks tab (/admin/tasks) in the 2026-06-30
 * review — cross-project tasks are reachable by drilling into a project. This guards
 * against it being re-added, and confirms the sibling admin tabs still render.
 */
test('@regression @admin admin nav has no Tasks tab', async ({ page }) => {
  await loginAs(page, 'admin');
  await page.goto('/admin');

  await expect(page.getByTestId('admin-layout')).toBeVisible();
  // The removed tab must be gone…
  await expect(page.getByTestId('admin-nav-tasks')).toHaveCount(0);
  // …while the surfaces we kept still render.
  await expect(page.getByTestId('admin-nav-templates')).toBeVisible();
  await expect(page.getByTestId('admin-nav-library')).toBeVisible();
  await expect(page.getByTestId('admin-nav-projects')).toBeVisible();
});
