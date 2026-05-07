import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { getNow } from '@/shared/lib/date-engine';

const { Given, When, Then } = createBdd();
let emailCounter = 0;

function resolveScenarioEmail(email: string) {
  if (email === 'newuser@example.com') {
    const uniqueEmailSuffix = `${getNow().getTime()}-${process.pid}-${emailCounter++}`;
    return `newuser+${uniqueEmailSuffix}@example.com`;
  }

  return email;
}

// ── Setup ───────────────────────────────────────────────────────────────────

Given('the user is on the login page', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
});

// ── Actions ─────────────────────────────────────────────────────────────────

When('the user enters email {string}', async ({ page }, email: string) => {
  const loginPage = new LoginPage(page);
  await loginPage.fillEmail(resolveScenarioEmail(email));
});

When('the user enters password {string}', async ({ page }, password: string) => {
  const loginPage = new LoginPage(page);
  await loginPage.fillPassword(password);
});

When('the user clicks the sign in button', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.clickSignIn();
});

When('the user clicks the toggle mode button', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.toggleSignUpMode();
});

When('the user submits with email {string} and password {string}', async ({ page }, email: string, password: string) => {
  const loginPage = new LoginPage(page);
  await loginPage.fillEmail(resolveScenarioEmail(email));
  await loginPage.fillPassword(password);
  await loginPage.clickSignIn();
});

// ── Assertions ──────────────────────────────────────────────────────────────

Then('a validation error {string} is shown for {string}', async ({ page }, message: string, field: string) => {
  const errorLocator = page.locator(`[data-testid="${field}-error"]`);
  await expect(errorLocator).toContainText(message);
});

Then('an email validation error is shown', async ({ page }) => {
  await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
});

Then('a password validation error is shown', async ({ page }) => {
  await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
});

Then('a loading spinner is visible on the submit button', async ({ page }) => {
  await expect(page.locator('button[type="submit"] .animate-spin')).toBeVisible({ timeout: 3000 });
});

Then('the auto-login button is visible', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await expect(loginPage.autoLoginButton).toBeVisible();
});

Then('the subtitle reads {string}', async ({ page }, text: string) => {
  await expect(page.locator('p.text-center.text-sm')).toContainText(text);
});

Then('the submit button reads {string}', async ({ page }, text: string) => {
  await expect(page.locator('button[type="submit"]')).toContainText(text);
});
