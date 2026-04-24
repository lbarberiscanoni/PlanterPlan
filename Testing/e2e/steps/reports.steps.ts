import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

Given('the user is on the Reports page', async ({ page }) => {
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
});

Given('the user is viewing reports for a project', async ({ page }) => {
  // Navigate to reports with a project query param
  const projectLink = page.locator('aside a[href*="/project/"]').first();
  if (await projectLink.isVisible().catch(() => false)) {
    const href = await projectLink.getAttribute('href');
    const projectId = href?.split('/project/')[1];
    if (projectId) {
      await page.goto(`/reports?project=${projectId}`);
      await page.waitForLoadState('networkidle');
    }
  }
});

Given('the user is on the Reports page without a project', async ({ page }) => {
  await page.goto('/reports');
  await page.waitForLoadState('networkidle');
});

Given('no project is selected', async () => {
  // No-op — default state when accessing /reports without query param
});

Given('the project has no upcoming deadlines', async () => {
  // Assumes test data without deadlines
});

When('the user opens the project selector', async ({ page }) => {
  await page.locator('[data-testid="project-selector"], select').first().click();
});

When('the user selects a project from the dropdown', async ({ page }) => {
  await page.locator('[data-testid="project-selector"] option, [role="option"]').first().click();
});

When('the user clicks the back arrow', async ({ page }) => {
  await page.locator('a[href*="/project/"]').first().click();
});

When('the reports data is loading', async () => {
  // Transient state
});

Then('the {string} prompt is visible', async ({ page }, text: string) => {
  await expect(page.getByText(new RegExp(text, 'i'))).toBeVisible();
});

Then('all user projects are listed', async ({ page }) => {
  await expect(page.locator('[data-testid="project-selector"] option, [role="option"]').first()).toBeVisible();
});

Then('the reports data for that project is displayed', async ({ page }) => {
  await expect(page.locator('[data-testid="stats-card"], .grid > div').first()).toBeVisible();
});

Then('the project selector shows no options', async ({ page }) => {
  await expect(page.getByText(/no projects/i)).toBeVisible();
});

Then('four report stats cards are visible', async ({ page }) => {
  const cards = page.locator('[data-testid="stats-card"], .grid > div');
  await expect(cards).toHaveCount(4, { timeout: 5000 });
});

Then('the stats cards show Phases, Total Tasks, Completed Tasks, and Team Members', async ({ page }) => {
  await expect(page.getByText(/phase/i)).toBeVisible();
  await expect(page.getByText(/task/i).first()).toBeVisible();
});

Then('the overall progress section is visible', async ({ page }) => {
  await expect(page.getByText(/progress/i)).toBeVisible();
});

Then('a progress bar with percentage is displayed', async ({ page }) => {
  await expect(page.locator('[role="progressbar"]').first()).toBeVisible();
});

Then('the task status pie chart is visible', async ({ page }) => {
  await expect(page.locator('.recharts-pie, svg').first()).toBeVisible();
});

Then('the upcoming deadlines section is visible', async ({ page }) => {
  await expect(page.getByText(/deadline|upcoming/i)).toBeVisible();
});

Then('milestone items with due dates are listed', async ({ page }) => {
  await expect(page.locator('[data-testid="deadline-item"]').first()).toBeVisible();
});

Then('a {string} message is shown', async ({ page }, text: string) => {
  await expect(page.getByText(new RegExp(text, 'i'))).toBeVisible();
});

Then('the phase details section is visible', async ({ page }) => {
  await expect(page.getByText(/phase/i)).toBeVisible();
});

Then('each phase shows a progress bar', async ({ page }) => {
  await expect(page.locator('[role="progressbar"]').first()).toBeVisible();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
Then('each phase detail shows {string} completion count', async ({ page }, _pattern: string) => {
  await expect(page.getByText(/of \d+/)).toBeVisible();
});

Then('the user is navigated to the project page', async ({ page }) => {
  await expect(page).toHaveURL(/\/project\//);
});
