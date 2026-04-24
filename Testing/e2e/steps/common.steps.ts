import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { AUTH_STATES, SELECTORS } from '../fixtures/test-data';

const { Given, When, Then } = createBdd();

// ── Authentication ──────────────────────────────────────────────────────────

Given('the user is logged in', async ({ page }) => {
  // Auth state loaded via storageState fixture — just verify we can access a page
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as project owner', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATES.owner });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as editor', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATES.editor });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as viewer', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATES.viewer });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as limited user', async ({ browser }) => {
  const context = await browser.newContext({ storageState: AUTH_STATES.limited });
  const page = await context.newPage();
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is not authenticated', async ({ page }) => {
  await page.context().clearCookies();
  await page.evaluate(() => window.localStorage.clear()).catch(() => {});
});

// ── Navigation ──────────────────────────────────────────────────────────────

When('the user navigates to {string}', async ({ page }, url: string) => {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
});

When('the user clicks "Add Task"', async ({ page }) => {
  await page.getByRole('button', { name: /add task/i }).first().click();
});

When('the user clicks "Settings"', async ({ page }) => {
  await page.getByRole('link', { name: /settings/i }).or(page.getByRole('button', { name: /settings/i })).first().click();
});

When('the user clicks "Log out"', async ({ page }) => {
  await page.getByRole('button', { name: /log out|logout|sign out/i }).or(page.getByRole('menuitem', { name: /log out|logout|sign out/i })).first().click();
});

Then('the user is redirected to {string}', async ({ page }, url: string) => {
  await expect(page).toHaveURL(new RegExp(url.replace('/', '\\/')));
});

Then('the page does not redirect to {string}', async ({ page }, url: string) => {
  await expect(page).not.toHaveURL(new RegExp(url.replace('/', '\\/')));
});

// ── Toast Notifications ─────────────────────────────────────────────────────

Then('a success toast appears', async ({ page }) => {
  await expect(page.locator(SELECTORS.toast).first()).toBeVisible({ timeout: 5000 });
});

Then('an error toast appears', async ({ page }) => {
  await expect(page.locator(SELECTORS.toast).first()).toBeVisible({ timeout: 5000 });
});

Then('an error toast with message {string} appears', async ({ page }, message: string) => {
  await expect(page.locator(SELECTORS.toast).filter({ hasText: message })).toBeVisible({ timeout: 5000 });
});

// ── Loading ─────────────────────────────────────────────────────────────────

Then('a loading spinner is visible', async ({ page }) => {
  await expect(page.locator(SELECTORS.spinner).first()).toBeVisible({ timeout: 3000 });
});

When('the page is loading', async ({ page }) => {
  // Intentional no-op — loading state is transient
  await page.waitForTimeout(100);
});

// ── General UI ──────────────────────────────────────────────────────────────

Then('the page title is visible', async ({ page }) => {
  await expect(page.locator('h1').first()).toBeVisible();
});

Then('a modal dialog is visible', async ({ page }) => {
  await expect(page.locator(SELECTORS.dialog)).toBeVisible();
});

// ── Viewport ────────────────────────────────────────────────────────────────

Given('the viewport is mobile size', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});
