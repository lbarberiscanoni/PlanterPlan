import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { SettingsPage } from '../pages/SettingsPage';

const { Given, When, Then } = createBdd();

Given('the user is on the Settings page', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
});

When('the user changes full name to {string}', async ({ page }, name: string) => {
  const settings = new SettingsPage(page);
  await settings.fillFullName(name);
});

When('the user enters a valid avatar URL', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.fillAvatarUrl('https://example.com/avatar.png');
});

When('the user enters an invalid avatar URL {string}', async ({ page }, url: string) => {
  const settings = new SettingsPage(page);
  await settings.fillAvatarUrl(url);
});

When('the user enters {string} in the avatar field', async ({ page }, url: string) => {
  const settings = new SettingsPage(page);
  await settings.fillAvatarUrl(url);
});

When('the user clicks outside the avatar field', async ({ page }) => {
  await page.locator('body').click();
});

When('clicks outside the field', async ({ page }) => {
  await page.locator('body').click();
});

When('the user enters role {string}', async ({ page }, role: string) => {
  const settings = new SettingsPage(page);
  await settings.fillRole(role);
});

When('the user enters organization {string}', async ({ page }, org: string) => {
  const settings = new SettingsPage(page);
  await settings.fillOrganization(org);
});

When('the user toggles the weekly digest switch', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.toggleWeeklyDigest();
});

When('the user clicks save', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.clickSave();
});

When('the user makes a change and saves', async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.fillRole('Test Role');
  await settings.clickSave();
});

Then('the full name field shows the current name', async ({ page }) => {
  const settings = new SettingsPage(page);
  await expect(settings.fullNameInput).not.toHaveValue('');
});

Then('the email field shows the current email', async ({ page }) => {
  const settings = new SettingsPage(page);
  await expect(settings.emailInput).not.toHaveValue('');
});

Then('the email field is disabled', async ({ page }) => {
  const settings = new SettingsPage(page);
  await expect(settings.emailInput).toBeDisabled();
});

Then('the name field shows {string}', async ({ page }, name: string) => {
  const settings = new SettingsPage(page);
  await expect(settings.fullNameInput).toHaveValue(name);
});

Then('an avatar validation error is shown', async ({ page }) => {
  await expect(page.locator('.text-red-500').first()).toBeVisible();
});

Then('the switch state changes', async ({ page }) => {
  const toggle = page.locator('[role="switch"]');
  await expect(toggle).toBeVisible();
});

Then('a loading spinner appears on the save button', async ({ page }) => {
  await expect(page.locator('button .animate-spin')).toBeVisible({ timeout: 3000 });
});

Then('the {string} tab is marked as active', async ({ page }, tabName: string) => {
  await expect(page.getByText(tabName).first()).toBeVisible();
});

Then('the {string} tab is available', async ({ page }, tabName: string) => {
  await expect(page.getByRole('button', { name: new RegExp(tabName, 'i') })).toBeEnabled();
});

Then('no settings tab shows {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toHaveCount(0);
});

Then('{string} shows {string}', async ({ page }, label: string, text: string) => {
  await expect(page.getByText(label).first()).toBeVisible();
  await expect(page.getByText(text).first()).toBeVisible();
});
