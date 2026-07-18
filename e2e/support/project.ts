import { type Page, expect } from '@playwright/test';

/**
 * Create a project by cloning the first REAL template (not the blank scaffold), give it a
 * run-tagged name, and land on /project/:id. Returns the project URL.
 *
 * Pass `startDate` (yyyy-mm-dd) to set the anchor explicitly; omit to keep the modal default
 * (today). Used by the day-offset regression to assert the chosen anchor is honored exactly.
 *
 * Flow verified in CreateProjectModal.tsx + CreationActionHost.tsx (navigates to /project/:id).
 */
export async function createProjectFromTemplate(
  page: Page,
  name: string,
  startDate?: string,
): Promise<string> {
  await page.getByTestId('project-switcher-trigger').click();
  await page.getByTestId('project-switcher-new-project').click();
  const modal = page.getByTestId('create-project-modal');
  await expect(modal).toBeVisible();

  const realTemplate = modal
    .locator('[data-testid="template-card"]:not([data-template-id="__default__"])')
    .first();
  await expect(realTemplate, 'a clonable template must exist in this environment').toBeVisible();
  await realTemplate.click();

  await modal.getByRole('button', { name: 'Continue to Details' }).click();
  await modal.locator('#title').fill(name);
  if (startDate) await modal.locator('#start_date').fill(startDate);
  await modal.getByRole('button', { name: 'Create Project' }).click();

  await page.waitForURL('**/project/**', { timeout: 20_000 });
  return page.url();
}

/** Add N days to a yyyy-mm-dd string. (Date is fine in specs — the ban is only on Workflow scripts.) */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
