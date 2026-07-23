import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-25 — an admin who attaches a custom URL resource to a task also seeds the global
 * resource library. @regression @resources
 *
 * Patrick/Tim (2026-07) asked that admin-added task resources flow into the shared catalog,
 * while a regular user's custom attachments stay custom. This creates a project as admin,
 * attaches a custom URL resource to a task via the "Custom link" tab, and asserts it now shows
 * on the /resources library page (proving the catalog was seeded + the attachment linked).
 */
test('@regression @resources admin attaching a custom URL resource adds it to the library', async ({ page }) => {
  await loginAs(page, 'admin');
  const projectName = tagged(`Admin resource ${Date.now()}`);
  await createProjectFromTemplate(page, projectName);

  // Scope /tasks to the new project so the first row is one of its tasks.
  await page.goto('/tasks');
  await page.locator('[aria-label="Task view"]').click();
  await page.getByRole('option', { name: 'All Tasks' }).click();
  await page.locator('[aria-label="Filter by project"]').click();
  await page.getByRole('option', { name: projectName }).click();

  // Open the first task's details — the read view renders the Resources section.
  const firstRow = page.getByRole('treeitem').first();
  await expect(firstRow).toBeVisible();
  await firstRow.click();

  const panel = page.getByTestId('task-details-panel');
  await expect(panel).toBeVisible();
  const taskResources = panel.getByTestId('task-resources');
  await taskResources.getByRole('button', { name: 'Add Resource' }).click();

  // Custom link tab: the admin hint confirms the link will also hit the shared library.
  const dialog = page.getByRole('dialog');
  await dialog.getByTestId('resource-mode-custom').click();
  await expect(dialog.getByTestId('resource-admin-catalog-hint')).toBeVisible();

  const resourceName = tagged(`Lib link ${Date.now()}`);
  await dialog.getByTestId('resource-custom-name').fill(resourceName);
  await dialog.locator('input[type="url"]').fill(`https://example.com/e2e-admin-${Date.now()}`);
  await dialog.getByRole('button', { name: 'Add Resource' }).click();
  await expect(dialog).toBeHidden();

  // The attachment was promoted into the global catalog.
  await page.goto('/resources');
  await expect(page.getByTestId('resources-table').getByText(resourceName)).toBeVisible();
});
