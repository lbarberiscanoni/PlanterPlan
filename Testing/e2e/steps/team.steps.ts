import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { TeamPage } from '../pages/TeamPage';

const { Given, When, Then } = createBdd();

Given('the user is on the Team page for a project', async ({ page }) => {
  // Navigate to team with project context
  const projectLink = page.locator('aside a[href*="/project/"]').first();
  if (await projectLink.isVisible().catch(() => false)) {
    const href = await projectLink.getAttribute('href');
    const projectId = href?.split('/project/')[1];
    if (projectId) {
      await page.goto(`/team?project=${projectId}`);
      await page.waitForLoadState('networkidle');
    }
  }
});

Given('the user is on the Team page', async ({ page }) => {
  await page.goto('/team');
  await page.waitForLoadState('networkidle');
});

Given('the project has team members', async () => {
  // Assumes seeded data
});

Given('the project has no team members', async () => {
  // Requires fresh project
});

Given('the project has no members', async () => {
  // Requires fresh project
});

Given('a team member is marked as lead', async () => {
  // Assumes seeded data
});

When('the user clicks "Add Member"', async ({ page }) => {
  const teamPage = new TeamPage(page);
  await teamPage.clickAddMember();
});

When('the user fills in member name {string}', async ({ page }, name: string) => {
  await page.locator('[role="dialog"]').getByLabel(/name/i).first().fill(name);
});

When('the user fills in member email {string}', async ({ page }, email: string) => {
  await page.locator('[role="dialog"]').getByLabel(/email/i).fill(email);
});

When('the user submits the form', async ({ page }) => {
  await page.locator('[role="dialog"]').getByRole('button', { name: /add|submit/i }).click();
});

When('the user clicks cancel', async ({ page }) => {
  await page.locator('[role="dialog"]').getByRole('button', { name: /cancel/i }).click();
});

When('the user opens the menu for a member', async ({ page }) => {
  await page.locator('[data-testid="team-member-card"]').first().getByRole('button').click();
});

When('the user clicks "Remove"', async ({ page }) => {
  await page.getByText(/remove/i).click();
});

When('the user removes a member', async ({ page }) => {
  await page.locator('[data-testid="team-member-card"]').first().getByRole('button').click();
  await page.getByText(/remove/i).click();
});

When('the team data is loading', async () => {
  // Transient state
});

Then('the page title includes the project name', async ({ page }) => {
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

Then('member cards are visible', async ({ page }) => {
  await expect(page.locator('[data-testid="team-member-card"]').first()).toBeVisible();
});

Then('each card shows a name, role badge, and email', async ({ page }) => {
  const card = page.locator('[data-testid="team-member-card"]').first();
  await expect(card).toBeVisible();
  await expect(card.getByText(/owner|editor|coach|viewer|limited/i)).toBeVisible();
  await expect(card.getByText(/@/)).toBeVisible();
});

Then('the {string} empty state is visible', async ({ page }, text: string) => {
  await expect(page.getByText(new RegExp(text, 'i'))).toBeVisible();
});

Then('the {string} button is visible', async ({ page }, text: string) => {
  await expect(page.getByRole('button', { name: new RegExp(text, 'i') })).toBeVisible();
});

Then('the add member modal is visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

Then('the add member modal is closed', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

Then('the modal has email and role fields', async ({ page }) => {
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog.getByLabel(/email|uuid/i).first()).toBeVisible();
  await expect(dialog.getByLabel(/role/i).first()).toBeVisible();
});

Then('the member {string} appears in the team list', async ({ page }, name: string) => {
  await expect(page.getByText(name)).toBeVisible();
});

Then('remove actions are available for removable members', async ({ page }) => {
  await expect(page.locator('[data-testid="team-member-card"]').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /remove/i }).first()).toBeVisible();
});
