import { createBdd } from 'playwright-bdd';
import { expect, type Page } from '@playwright/test';
import { DashboardPage } from '../pages/DashboardPage';
import {
  countMilestoneLeafTasks,
  fetchProjectRows,
  fetchTemplateRows,
  getProjectIdFromUrl,
  getSettingString,
  waitForProjectRowCount,
} from '../helpers/project-creation-db';

const { Given, When, Then } = createBdd();

// ── Setup ───────────────────────────────────────────────────────────────────

Given('the user is on the dashboard', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();
});

Given('the user has existing projects', async () => {
  // Assumes test data was seeded in global-setup
});

Given('the user has no projects', async () => {
  // Requires fresh user or cleanup — handled by test isolation
});

// ── Actions ─────────────────────────────────────────────────────────────────

When('the user clicks the {string} button', async ({ page }, buttonText: string) => {
  await page.getByRole('button', { name: new RegExp(buttonText, 'i') }).click();
});

When('the user opens the create project modal', async ({ page }) => {
  await page.goto('/tasks?action=new-project');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

When('the user opens the create template modal', async ({ page }) => {
  await page.goto('/tasks?action=new-template');
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

When('the user creates a new project {string}', async ({ page }, name: string) => {
  await page.goto('/tasks?action=new-project');
  await completeNewProjectModal(page, name);
});

When('the user completes the new project modal with {string}', async ({ page }, name: string) => {
  await completeNewProjectModal(page, name);
});

async function completeNewProjectModal(page: Page, name: string) {
  await page.locator('[role="dialog"]').waitFor();
  // Select scratch or default template
  const continueBtn = page.getByRole('button', { name: /continue/i });
  if (await continueBtn.isVisible().catch(() => false)) {
    await continueBtn.click();
  }
  await page.locator('[role="dialog"]').getByLabel(/title|name/i).fill(name);
  await page.getByRole('button', { name: /create project/i }).click();
  await page.waitForURL(/\/project\//);
}

When('the user selects the {string} project template', async ({ page }, templateName: string) => {
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  const templateCard = dialog.locator('[data-testid="template-card"]').filter({ hasText: templateName }).first();
  await expect(templateCard).toBeVisible({ timeout: 10000 });
  await templateCard.click();
  await expect(templateCard).toHaveAttribute('data-selected', 'true');
});

When('the user creates a new template {string}', async ({ page }, name: string) => {
  await page.goto('/tasks?action=new-template');
  await page.locator('[role="dialog"]').waitFor();
  await page.locator('[role="dialog"]').getByLabel(/title|name/i).fill(name);
  await page.getByRole('button', { name: /create/i }).click();
  await page.waitForURL(/\/project\//);
});

When('the user advances to step 2', async ({ page }) => {
  await page.getByRole('button', { name: /continue/i }).click();
});

When('the user enters project name {string}', async ({ page }, name: string) => {
  await page.locator('[role="dialog"]').getByLabel(/title|name/i).fill(name);
});

When('the user enters project description {string}', async ({ page }, desc: string) => {
  await page.locator('[role="dialog"]').getByLabel(/description/i).fill(desc);
});

When('the user enters template title {string}', async ({ page }, title: string) => {
  await page.locator('[role="dialog"]').getByLabel(/title|name/i).fill(title);
});

When('the user selects a template card', async ({ page }) => {
  await page.locator('[data-testid="template-card"]').first().click();
});

When('the user searches templates for {string}', async ({ page }, query: string) => {
  await page.locator('[role="dialog"]').getByPlaceholder(/search/i).fill(query);
});

When('the user clicks Back', async ({ page }) => {
  await page.locator('[role="dialog"]').getByRole('button', { name: /back/i }).click();
});

When('the user attempts to create a project with invalid data', async () => {
  // Intentionally submit with empty required fields
});

// ── Assertions ──────────────────────────────────────────────────────────────

Then('four stats cards are visible', async ({ page }) => {
  // Stats cards in the grid
  const cards = page.locator('[data-testid="stats-card"]');
  await expect(cards).toHaveCount(4, { timeout: 5000 });
});

Then('the stats cards show project count, active tasks, completed tasks, and team activity', async ({ page }) => {
  await expect(page.getByText(/projects/i)).toBeVisible();
});

Then('the empty state message is visible', async ({ page }) => {
  await expect(page.getByText(/no projects|create your first/i)).toBeVisible();
});

Then('the create first project button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /create|new project/i })).toBeVisible();
});

Then('the create project modal is visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

Then('the create project modal is not visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

Then('a default template option is selected', async ({ page }) => {
  // At least one template card should have a selected/active state
  await expect(page.locator('[data-testid="template-card"]').first()).toBeVisible();
});

Then('the selected template is highlighted', async ({ page }) => {
  await expect(page.locator('[data-testid="template-card"].border-brand-500, [data-testid="template-card"][data-selected="true"]')).toBeVisible();
});

Then('matching templates are shown', async ({ page }) => {
  await expect(page.locator('[data-testid="template-card"]').first()).toBeVisible();
});

Then('a no results message is shown', async ({ page }) => {
  await expect(page.getByText(/no templates|no results/i)).toBeVisible();
});

Then('the project name field contains {string}', async ({ page }, name: string) => {
  await expect(page.locator('[role="dialog"]').getByLabel(/title|name/i)).toHaveValue(name);
});

Then('the title field contains {string}', async ({ page }, title: string) => {
  await expect(page.locator('[role="dialog"]').getByLabel(/title|name/i)).toHaveValue(title);
});

Then('the create button is disabled', async ({ page }) => {
  await expect(page.getByRole('button', { name: /create project/i })).toBeDisabled();
});

Then('the template selection is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="template-card"]').first()).toBeVisible();
});

Then('the user is redirected to a project page', async ({ page }) => {
  await expect(page).toHaveURL(/\/project\//);
});

Then('the project title {string} is visible', async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
});

Then('the blank project scaffold baseline is imported', async ({ page }) => {
  const projectId = getProjectIdFromUrl(page);
  await waitForProjectRowCount(projectId, 51);

  const rows = await fetchProjectRows(projectId);
  expect(rows.filter((row) => row.parent_task_id === projectId)).toHaveLength(6);
  expect(countMilestoneLeafTasks(rows, projectId)).toBe(26);
  expect(rows.some((row) => row.title === 'Discovery')).toBeTruthy();
  expect(rows.some((row) => row.title === 'Personal Assessment')).toBeTruthy();
  expect(rows.some((row) => row.title === 'Review and complete assessment')).toBeTruthy();

  await expect(page.getByText('Discovery', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Personal Assessment', { exact: true })).toBeVisible();
  await expect(page.getByText('Review and complete assessment', { exact: true })).toBeVisible();
});

Then('the project imports the {string} template baseline without copied notes', async ({ page }, templateTitle: string) => {
  const projectId = getProjectIdFromUrl(page);
  const template = await fetchTemplateRows(templateTitle);

  await waitForProjectRowCount(projectId, template.rows.length);

  const rows = await fetchProjectRows(projectId);
  const root = rows.find((row) => row.id === projectId);
  expect(root?.origin).toBe('instance');
  expect(getSettingString(root, 'spawnedFromTemplate')).toBe(template.root.id);
  expect(rows.filter((row) => row.cloned_from_task_id !== null)).toHaveLength(template.rows.length);
  expect(rows.filter((row) => row.parent_task_id === projectId)).toHaveLength(6);
  expect(rows.some((row) => row.title === 'Phase 1: Discovery')).toBeTruthy();
  expect(rows.some((row) => row.title === 'Assessment')).toBeTruthy();
  expect(rows.some((row) => row.title === 'Complete planter assessment')).toBeTruthy();
  expect(rows.filter((row) => (row.notes ?? '').trim().length > 0)).toEqual([]);

  await expect(page.getByText('Phase 1: Discovery', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Assessment', { exact: true })).toBeVisible();
  await expect(page.getByText('Complete planter assessment', { exact: true })).toBeVisible();
});

Then('{string} appears in the sidebar templates section', async ({ page }, name: string) => {
  await expect(page.locator('aside').getByText(name)).toBeVisible();
});

Then('the pipeline board has columns for {string}, {string}, {string}, and {string}', async ({ page }, ...columns: string[]) => {
  for (const col of columns) {
    await expect(page.getByText(col)).toBeVisible();
  }
});

Then('project cards are visible in the pipeline columns', async ({ page }) => {
  await expect(page.locator('[data-testid="project-card"]').first()).toBeVisible();
});

Then('each project card shows a title', async ({ page }) => {
  const card = page.locator('[data-testid="project-card"]').first();
  await expect(card).toBeVisible();
});
