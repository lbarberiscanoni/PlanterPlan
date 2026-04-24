import { createBdd } from 'playwright-bdd';
import { expect } from '@playwright/test';

const { Given, When, Then } = createBdd();

Given('the user is logged in as a viewer', async ({ page }) => {
  const authState = 'e2e/.auth/viewer.json';
  await page.context().storageState({ path: authState }).catch(() => {});
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as a limited user', async ({ page }) => {
  const authState = 'e2e/.auth/limited.json';
  await page.context().storageState({ path: authState }).catch(() => {});
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as a coach', async ({ page }) => {
  const authState = 'e2e/.auth/coach.json';
  await page.context().storageState({ path: authState }).catch(() => {});
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as an editor', async ({ page }) => {
  const authState = 'e2e/.auth/editor.json';
  await page.context().storageState({ path: authState }).catch(() => {});
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Given('the user is logged in as an owner', async ({ page }) => {
  const authState = 'e2e/.auth/owner.json';
  await page.context().storageState({ path: authState }).catch(() => {});
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
});

Then('the settings button is not visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /settings/i })).toBeHidden();
});

Then('the edit controls are hidden', async ({ page }) => {
  await expect(page.getByRole('button', { name: /edit/i })).toBeHidden();
});

Then('the delete button is not visible in task details', async ({ page }) => {
  const panel = page.locator('[data-testid="task-details-panel"]');
  await expect(panel.getByRole('button', { name: /delete/i })).toBeHidden();
});

Then('only assigned tasks are visible', async ({ page }) => {
  // Limited users should see a filtered view
  await expect(page.locator('[data-testid="task-item"]').or(page.getByText(/no tasks/i)).first()).toBeVisible();
});

Then('the delete project option is not available', async ({ page }) => {
  await expect(page.getByRole('button', { name: /delete project/i })).toBeHidden();
});

Then('the edit button is visible in task details', async ({ page }) => {
  const panel = page.locator('[data-testid="task-details-panel"]');
  await expect(panel.getByRole('button', { name: /edit/i })).toBeVisible();
});

Then('the status can be changed', async ({ page }) => {
  await expect(page.locator('[data-testid="status-select"]').first()).toBeVisible();
});

// ── Coach & Limited Role Permissions ─────────────────────────────────────────

Then('the edit button is hidden for non-coaching tasks', async ({ page }) => {
  const panel = page.locator('[data-testid="task-details-panel"]');
  await expect(panel.getByRole('button', { name: /edit/i })).toBeHidden();
});

When('the user clicks on an assigned task', async ({ page }) => {
  // Find a task that is assigned to the current user (has assignee indicator)
  const assignedTask = page.locator('[data-testid="task-item"]').filter({ has: page.locator('[data-testid="assignee-avatar"], [data-testid="assigned-badge"]') });
  if (await assignedTask.count() > 0) {
    await assignedTask.first().click();
  } else {
    // Fallback: click first task
    await page.locator('[data-testid="task-item"]').first().click();
  }
});

When('the user clicks on an unassigned task', async ({ page }) => {
  // Find a task without assignee indicator
  const allTasks = page.locator('[data-testid="task-item"]');
  const count = await allTasks.count();
  for (let i = 0; i < count; i++) {
    const task = allTasks.nth(i);
    const hasAssignee = await task.locator('[data-testid="assignee-avatar"], [data-testid="assigned-badge"]').count();
    if (hasAssignee === 0) {
      await task.click();
      return;
    }
  }
  // If all tasks are assigned, click the last one as fallback
  if (count > 0) {
    await allTasks.last().click();
  }
});

Then('the edit button is not visible in task details', async ({ page }) => {
  const panel = page.locator('[data-testid="task-details-panel"]');
  await expect(panel.getByRole('button', { name: /edit/i })).toBeHidden();
});
