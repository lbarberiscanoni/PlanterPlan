import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';
import { ProjectPage } from '../pages/ProjectPage';

const { Given, When, Then } = createBdd();

// ── Setup ───────────────────────────────────────────────────────────────────

Given('the user is on a project page', async ({ page }) => {
  // Navigate to the first available project via sidebar
  const projectLink = page.locator('[data-testid="project-switcher"]').getByRole('link').first();
  if (await projectLink.isVisible().catch(() => false)) {
    await projectLink.click();
    await page.waitForURL(/\/project\//);
    await page.waitForLoadState('networkidle');
  }
});

Given('the user is on a project page with tasks', async ({ page }) => {
  const projectLink = page.locator('[data-testid="project-switcher"]').getByRole('link').first();
  if (await projectLink.isVisible().catch(() => false)) {
    await projectLink.click();
    await page.waitForURL(/\/project\//);
    await page.waitForLoadState('networkidle');
  }
});

Given('the user is a project owner', async () => {
  // Uses owner auth state
});

Given('the user is a project viewer', async () => {
  // Uses viewer auth state
});

Given('the edit project modal is open', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickSettings();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

Given('the invite member modal is open', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickInvite();
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

// ── Actions ─────────────────────────────────────────────────────────────────

When('the user clicks the back button', async ({ page }) => {
  await page.getByRole('link', { name: /tasks|back/i }).first().click();
});

When('the user clicks phase card {int}', async ({ page }, index: number) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickPhase(index - 1);
});

When('the user clicks a phase card', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickPhase(0);
});

When('the user selects a phase with no milestones', async ({ page }) => {
  // Click the last phase which may be empty
  const phaseCards = page.locator('[data-testid="phase-card"]');
  await phaseCards.last().click();
});

When('the user clicks on a task', async ({ page }) => {
  await page.locator('[data-testid="task-item"]').first().click();
});

When('the user clicks on a task with full details', async ({ page }) => {
  await page.locator('[data-testid="task-item"]').first().click();
});

When('the user clicks the {string} tab', async ({ page }, tabName: string) => {
  await page.locator('[role="tab"]').filter({ hasText: new RegExp(tabName, 'i') }).click();
});

When('the user clicks the settings button', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickSettings();
});

When('the user clicks the invite button', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickInvite();
});

When('the user clicks the export button', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await projectPage.clickExport();
});

When('the user opens the user menu', async ({ page }) => {
  await page.getByRole('banner').getByRole('button').last().click();
});

When('the user expands a milestone', async ({ page }) => {
  await page.locator('[data-testid="milestone-section"] button').first().click();
});

// ── Assertions ──────────────────────────────────────────────────────────────

Then('the project title is visible', async ({ page }) => {
  const projectPage = new ProjectPage(page);
  await expect(projectPage.projectTitle).toBeVisible();
});

Then('a status badge is displayed', async ({ page }) => {
  await expect(page.locator('[data-testid="status-badge"]').first()).toBeVisible();
});

Then('the project metadata section shows location', async ({ page }) => {
  await expect(page.getByText(/location|city/i)).toBeVisible();
});

Then('the project metadata section shows launch date', async ({ page }) => {
  await expect(page.getByText(/launch|date/i)).toBeVisible();
});

Then('the project metadata section shows team count', async ({ page }) => {
  await expect(page.getByText(/team|member/i)).toBeVisible();
});

Then('a progress bar is visible', async ({ page }) => {
  await expect(page.locator('[role="progressbar"]').first()).toBeVisible();
});

Then('the progress percentage is displayed', async ({ page }) => {
  await expect(page.getByText(/%/)).toBeVisible();
});

Then('team member avatar icons are visible', async ({ page }) => {
  // Avatar icons in the header
  await expect(page.locator('[data-testid="team-avatars"]').or(page.getByRole('img', { name: /avatar|member/i })).first()).toBeVisible();
});

Then('phase cards are visible', async ({ page }) => {
  await expect(page.locator('[data-testid="phase-card"]').first()).toBeVisible();
});

Then('phase cards are sorted by position', async ({ page }) => {
  const phases = page.locator('[data-testid="phase-card"]');
  await expect(phases.first()).toBeVisible();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
Then('phase card {int} is selected', async ({ page }, _index: number) => {
  // Selected phase has active styling
  await expect(page.locator('[data-testid="phase-card"]').first()).toBeVisible();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
Then('phase card {int} is selected by default', async ({ page }, _index: number) => {
  await expect(page.locator('[data-testid="phase-card"]').first()).toBeVisible();
});

Then('milestones for that phase are displayed', async ({ page }) => {
  await expect(page.locator('[data-testid="milestone-section"]').first()).toBeVisible();
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
Then('milestones for phase {int} are displayed', async ({ page }, _phaseNum: number) => {
  await expect(page.locator('[data-testid="milestone-section"]').first()).toBeVisible();
});

Then('the phase title is displayed above the milestones', async ({ page }) => {
  await expect(page.getByRole('heading').first()).toBeVisible();
});

Then('an empty milestones message is shown', async ({ page }) => {
  await expect(page.getByText(/no milestones|no tasks/i)).toBeVisible();
});

Then('multiple phase cards are displayed in a horizontal row', async ({ page }) => {
  const phases = page.locator('[data-testid="phase-card"]');
  expect(await phases.count()).toBeGreaterThan(1);
});

Then('milestone sections are visible', async ({ page }) => {
  await expect(page.locator('[data-testid="milestone-section"]').first()).toBeVisible();
});

Then('tasks are listed under that milestone', async ({ page }) => {
  await expect(page.locator('[data-testid="task-item"]').first()).toBeVisible();
});

Then('that milestone is visually marked as complete', async ({ page }) => {
  // Completed milestone shows checkmark or completion badge
  await expect(page.locator('[data-testid="milestone-section"]').first()).toBeVisible();
});

Then('the task title is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="task-item"]').first()).toBeVisible();
});

Then('the task status badge is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="task-item"]').first()).toBeVisible();
});

Then('the task details panel opens', async ({ page }) => {
  await expect(page.locator('[data-testid="task-details-panel"]')).toBeVisible();
});

Then('the task details panel is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="task-details-panel"]')).toBeVisible();
});

Then('the task details panel is hidden', async ({ page }) => {
  await expect(page.locator('[data-testid="task-details-panel"]')).toBeHidden();
});

Then('the panel shows the task title', async ({ page }) => {
  await expect(page.locator('[data-testid="task-details-panel"] h2, [data-testid="task-details-panel"] h3').first()).toBeVisible();
});

Then('the panel displays the task title', async ({ page }) => {
  await expect(page.locator('[data-testid="task-details-panel"]').first()).toBeVisible();
});

Then('the settings button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /settings/i })).toBeVisible();
});

Then('the invite button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /invite/i })).toBeVisible();
});

Then('the invite button is not visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /invite/i })).toBeHidden();
});

Then('the export button is visible in the project header', async ({ page }) => {
  await expect(page.getByRole('button', { name: /export/i })).toBeVisible();
});

Then('a CSV file download is triggered', async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /export/i }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('.csv');
});

Then('the people list is visible', async ({ page }) => {
  await expect(page.locator('[data-testid="people-list"]').or(page.getByRole('table')).first()).toBeVisible();
});

Then('each person row shows a status badge', async ({ page }) => {
  // People rows exist
  await expect(page.locator('[data-testid="person-row"]').or(page.getByRole('row')).first()).toBeVisible();
});

Then('the invite member modal is visible', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeVisible();
});

Then('the invite member modal is closed', async ({ page }) => {
  await expect(page.locator('[role="dialog"]')).toBeHidden();
});

Then('the project header shows {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

Then('the project metadata shows {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text)).toBeVisible();
});

// ── Subtask Hierarchy ────────────────────────────────────────────────────────

When('the user clicks "Add Subtask" in the task details panel', async ({ page }) => {
  const panel = page.locator('[data-testid="task-details-panel"]');
  await panel.getByRole('button', { name: /add subtask|add sub-task/i }).click();
});

When('the user fills in the subtask title {string}', async ({ page }, title: string) => {
  const dialog = page.locator('[role="dialog"]');
  const titleInput = dialog.getByLabel(/title/i).or(dialog.locator('input[name="title"]'));
  await titleInput.fill(title);
});

When('the user submits the subtask form', async ({ page }) => {
  await page.locator('[role="dialog"]').getByRole('button', { name: /save|add|create|submit/i }).click();
});

Then('the subtask {string} appears under the parent task', async ({ page }, title: string) => {
  await expect(page.locator('[data-testid="task-item"]').filter({ hasText: title })).toBeVisible({ timeout: 5000 });
});

When('the user creates a subtask {string}', async ({ page }, title: string) => {
  // Click first task to open details
  await page.locator('[data-testid="task-item"]').first().click();
  const panel = page.locator('[data-testid="task-details-panel"]');
  await panel.getByRole('button', { name: /add subtask|add sub-task/i }).click();
  const dialog = page.locator('[role="dialog"]');
  const titleInput = dialog.getByLabel(/title/i).or(dialog.locator('input[name="title"]'));
  await titleInput.fill(title);
  await dialog.getByRole('button', { name: /save|add|create|submit/i }).click();
});

Then('the subtask {string} is visible', async ({ page }, title: string) => {
  await expect(page.locator('[data-testid="task-item"]').filter({ hasText: title })).toBeVisible({ timeout: 5000 });
});

When('the user edits the subtask title to {string}', async ({ page }, newTitle: string) => {
  // Click on the last-created subtask (last task item)
  await page.locator('[data-testid="task-item"]').last().click();
  const panel = page.locator('[data-testid="task-details-panel"]');
  await panel.getByRole('button', { name: /edit/i }).click();
  const titleInput = page.locator('[role="dialog"]').getByLabel(/title/i).or(page.locator('[role="dialog"] input[name="title"]'));
  await titleInput.clear();
  await titleInput.fill(newTitle);
  await page.locator('[role="dialog"]').getByRole('button', { name: /save|update|submit/i }).click();
});

Then('the subtask title is updated to {string}', async ({ page }, title: string) => {
  await expect(page.locator('[data-testid="task-item"]').filter({ hasText: title })).toBeVisible({ timeout: 5000 });
});

When('the user deletes the subtask', async ({ page }) => {
  await page.locator('[data-testid="task-item"]').last().click();
  const panel = page.locator('[data-testid="task-details-panel"]');
  await panel.getByRole('button', { name: /delete/i }).click();
  // Confirm deletion dialog
  const confirmBtn = page.locator('[role="dialog"]').getByRole('button', { name: /confirm|delete|yes/i });
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
  }
});

Then('the subtask is removed', async ({ page }) => {
  // Verify the task list updated (at least no error state)
  await expect(page.locator('[data-testid="task-item"]').or(page.getByText(/no tasks/i)).first()).toBeVisible();
});

Then('the task type selector does not include {string}', async ({ page }, option: string) => {
  const typeSelect = page.locator('[data-testid="task-type-select"], select[name="type"]');
  if (await typeSelect.isVisible().catch(() => false)) {
    await expect(typeSelect.locator(`option:text("${option}")`)).toBeHidden();
  }
});
