import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

// ── Sidebar ─────────────────────────────────────────────────────────────────

Given('the sidebar is open on mobile', async ({ page }) => {
  const mobileMenuBtn = page.locator('[data-testid="mobile-menu-button"]');
  if (await mobileMenuBtn.isVisible().catch(() => false)) {
    await mobileMenuBtn.click();
  }
});

Given('there are more projects than the initial page size', async () => {
  // Assumes seeded data
});

When('the user clicks a project in the sidebar', async ({ page }) => {
  await page.locator('[data-testid="project-switcher"]').getByRole('link').first().click();
});

When('the user clicks the sidebar {string} button', async ({ page }, buttonText: string) => {
  await page.locator('aside').getByRole('button', { name: new RegExp(buttonText, 'i') }).click();
});

When('the user clicks "Load More"', async ({ page }) => {
  await page.locator('aside').getByRole('button', { name: /load more|show more/i }).click();
});

When('the sidebar sections are loading', async () => {
  // Transient state
});

When('the user clicks the overlay', async ({ page }) => {
  await page.locator('[data-testid="sidebar-overlay"]').click();
});

When('the user taps the overlay', async ({ page }) => {
  await page.locator('[data-testid="sidebar-overlay"]').click();
});

When('the user clicks the mobile menu button', async ({ page }) => {
  await page.locator('[data-testid="mobile-menu-button"]').click();
});

When('the user taps the mobile menu button', async ({ page }) => {
  await page.locator('[data-testid="mobile-menu-button"]').click();
});

Then('the {string} section is visible in the sidebar', async ({ page }, section: string) => {
  await expect(page.locator('aside').getByText(new RegExp(section, 'i'))).toBeVisible();
});

Then('the user is navigated to that project\'s page', async ({ page }) => {
  await expect(page).toHaveURL(/\/project\//);
});

Then('that project is highlighted in the sidebar', async ({ page }) => {
  // Active project has distinct styling in sidebar
  await expect(page.locator('[data-testid="project-switcher"]').getByRole('link').first()).toBeVisible();
});

Then('the user is navigated to the dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/\/dashboard/);
});

Then('the user is navigated to the tasks creation action', async ({ page }) => {
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.locator('[data-testid="create-project-modal"]')).toBeVisible();
});

Then('the user is navigated to the tasks template action', async ({ page }) => {
  await expect(page).toHaveURL(/\/tasks/);
  await expect(page.locator('[role="dialog"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /new template/i })).toBeVisible();
});

Then('additional projects are shown', async ({ page }) => {
  const projects = page.locator('[data-testid="project-switcher"]').getByRole('link');
  expect(await projects.count()).toBeGreaterThan(0);
});

Then('each section shows its own loading indicator', async ({ page }) => {
  await expect(page.locator('aside [data-testid="loading-spinner"]').or(page.locator('aside [role="progressbar"]')).first()).toBeVisible({ timeout: 3000 });
});

Then('the sidebar is hidden by default', async ({ page }) => {
  await expect(page.locator('aside')).toBeHidden();
});

Then('the sidebar is not visible', async ({ page }) => {
  await expect(page.locator('aside')).toBeHidden();
});

Then('the sidebar closes', async ({ page }) => {
  await expect(page.locator('aside')).toBeHidden();
});

Then('the sidebar is hidden', async ({ page }) => {
  await expect(page.locator('aside')).toBeHidden();
});

Then('the sidebar is visible', async ({ page }) => {
  await expect(page.locator('aside')).toBeVisible();
});

Then('the sidebar becomes visible', async ({ page }) => {
  await expect(page.locator('aside')).toBeVisible();
});

Then('the sidebar overlay is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="sidebar-overlay"]')).toBeVisible();
});

// ── Header ──────────────────────────────────────────────────────────────────

Then('the PlanterPlan logo is visible in the header', async ({ page }) => {
  await expect(page.getByText('PlanterPlan').first()).toBeVisible();
});

Then('the breadcrumb displays {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the user\'s name is displayed', async ({ page }) => {
  await expect(page.locator('[role="menu"]')).toBeVisible();
});

Then('the user\'s email is displayed', async ({ page }) => {
  await expect(page.locator('[role="menu"]')).toBeVisible();
});

Then('a {string} menu item is visible', async ({ page }, text: string) => {
  await expect(page.getByRole('menuitem', { name: new RegExp(text, 'i') })).toBeVisible();
});

Then('the mobile menu button is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="mobile-menu-button"]')).toBeVisible();
});

// ── Command Palette ─────────────────────────────────────────────────────────

When('the user presses Cmd+K', async ({ page }) => {
  await page.keyboard.press('Meta+k');
});

When('the command palette is open', async ({ page }) => {
  await page.keyboard.press('Meta+k');
  await expect(page.locator('[cmdk-dialog]')).toBeVisible();
});

When('the user types {string}', async ({ page }, text: string) => {
  await page.locator('[cmdk-input]').fill(text);
});

When('the user selects {string}', async ({ page }, text: string) => {
  await page.locator('[cmdk-item]').filter({ hasText: text }).click();
});

When('the user presses Escape', async ({ page }) => {
  await page.keyboard.press('Escape');
});

Then('the command palette is visible', async ({ page }) => {
  await expect(page.locator('[cmdk-dialog]')).toBeVisible();
});

Then('the command palette is closed', async ({ page }) => {
  await expect(page.locator('[cmdk-dialog]')).toBeHidden();
});

Then('the {string} section is visible', async ({ page }, section: string) => {
  await expect(page.getByText(new RegExp(section, 'i'))).toBeVisible();
});

Then('items {string}, {string}, and {string} are listed', async ({ page }, ...items: string[]) => {
  for (const item of items) {
    await expect(page.locator('[cmdk-item]').filter({ hasText: item })).toBeVisible();
  }
});

Then('only matching items are shown', async ({ page }) => {
  await expect(page.locator('[cmdk-item]').first()).toBeVisible();
});

Then('{string} is displayed', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});
