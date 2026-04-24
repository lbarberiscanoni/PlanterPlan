import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { When, Then } = createBdd();

When('the user navigates to the home page', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

When('the user navigates to the home page on a mobile device', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

When('the user clicks the sign up call-to-action', async ({ page }) => {
  await page.getByRole('link', { name: /get started|sign up|start/i }).first().click();
});

Then('the hero section with heading and call-to-action is visible', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /get started|sign up|start/i }).first()).toBeVisible();
});

Then('feature description cards are visible', async ({ page }) => {
  const features = page.locator('[data-testid="feature-card"]').or(page.locator('section').filter({ hasText: /feature|plan|manage/i }));
  await expect(features.first()).toBeVisible();
});

Then('the user is redirected to the login page', async ({ page }) => {
  await expect(page).toHaveURL(/\/login/);
});

Then('navigation links are visible in the header', async ({ page }) => {
  await expect(page.getByRole('navigation').or(page.getByRole('banner'))).toBeVisible();
});

Then('the page displays correctly in a stacked layout', async ({ page }) => {
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toBeVisible();
});
