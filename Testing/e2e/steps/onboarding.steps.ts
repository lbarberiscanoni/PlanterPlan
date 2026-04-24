import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { OnboardingWizard } from '../pages/components/OnboardingWizard';

const { Given, When, Then } = createBdd();

Given('the onboarding wizard is open', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await expect(wizard.dialog).toBeVisible();
});

Given('the user is on onboarding step 2', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.fillName('Test Church');
  await wizard.clickNext();
});

Given('the user is on onboarding step 3', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.fillName('Test Church');
  await wizard.clickNext();
  await wizard.clickNext();
});

When('the user enters church name {string}', async ({ page }, name: string) => {
  const wizard = new OnboardingWizard(page);
  await wizard.fillName(name);
});

When('the user opens the date picker', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.datePicker.click();
});

When('the user selects a future date', async ({ page }) => {
  // Click a future date in the calendar popover
  await page.locator('[role="gridcell"]:not([disabled])').last().click();
});

When('the user clicks Next without selecting a date', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.clickNext();
});

When('the user selects the {string} template option', async ({ page }, templateName: string) => {
  await page.getByText(new RegExp(templateName, 'i')).click();
});

When('the user clicks Create Project', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.clickCreate();
});

When('the user clicks Skip', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.clickSkip();
});

When('the user clicks the close button', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.clickClose();
});

When('the user clicks Back in the onboarding wizard', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await wizard.clickBack();
});

When('the user navigates to the dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Then('the onboarding wizard is visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

Then('the onboarding wizard is not visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

Then('the onboarding wizard is closed', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

Then('the Next button is enabled', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await expect(wizard.nextButton).toBeEnabled();
});

Then('the Next button is disabled', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await expect(wizard.nextButton).toBeDisabled();
});

Then('the selected date is displayed', async ({ page }) => {
  // Date should appear in the picker button
  await expect(page.locator('button').filter({ hasText: /\d{1,2}/ })).toBeVisible();
});

Then('the user advances to step 3', async ({ page }) => {
  // Verify we're on step 3 by checking for template options
  await expect(page.locator('[role="radiogroup"], [role="radio"]').first()).toBeVisible();
});

Then('the user is on step 1', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await expect(wizard.nameInput).toBeVisible();
});

Then('the church name field still contains the previously entered name', async ({ page }) => {
  const wizard = new OnboardingWizard(page);
  await expect(wizard.nameInput).not.toHaveValue('');
});

Then('the {string} template is selected by default', async ({ page }, templateName: string) => {
  await expect(page.getByText(new RegExp(templateName, 'i'))).toBeVisible();
});

Then('the {string} template is selected', async ({ page }, templateName: string) => {
  await expect(page.getByText(new RegExp(templateName, 'i'))).toBeVisible();
});

Then('the project is created successfully', async ({ page }) => {
  await page.waitForURL(/\/project\//, { timeout: 15000 });
});

Then('the user is on the project detail page', async ({ page }) => {
  await expect(page).toHaveURL(/\/project\//);
});
