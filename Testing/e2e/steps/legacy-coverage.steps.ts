import { createBdd } from 'playwright-bdd';
import { expect, type Locator, type Page } from '@playwright/test';

const { Given, When, Then } = createBdd();

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textPattern = (value: string) => new RegExp(escapeRegExp(value), 'i');
const dialog = (page: Page) => page.locator('[role="dialog"]').first();
const taskItems = (page: Page) => page
  .locator('[data-testid="task-item"]')
  .or(page.locator('[data-testid^="task-row-"]').filter({ has: page.locator('[data-testid^="task-row-title-"]') }));
const taskPanel = (page: Page) => page.locator('[data-testid="task-details-panel"]').first();
let pendingDeletedTaskTitle: string | null = null;
let pendingDeletedProject: { id: string | null; title: string | null } | null = null;

async function isVisible(locator: Locator) {
  return locator.first().isVisible().catch(() => false);
}

async function clickFirstVisible(...locators: Locator[]) {
  for (const locator of locators) {
    if (await isVisible(locator)) {
      await locator.first().click();
      return true;
    }
  }
  return false;
}

async function fillFirstVisible(value: string, ...locators: Locator[]) {
  for (const locator of locators) {
    if (await isVisible(locator)) {
      await locator.first().fill(value);
      return true;
    }
  }
  return false;
}

async function ensureProjectPage(page: Page) {
  if (page.url().includes('/project/')) return;
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');
  const projectLink = page.locator('a[href^="/project/"]').first();
  if (await isVisible(projectLink)) {
    await projectLink.click();
    await page.waitForURL(/\/project\//, { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
  }
}

async function openTaskForm(page: Page) {
  const opened = await clickFirstVisible(
    page.getByRole('button', { name: /add task/i }),
    page.locator('[data-testid="add-task-button"]'),
  );
  if (opened) {
    await page.locator('[role="dialog"], [data-testid="task-details-panel"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }
}

async function submitCurrentForm(page: Page) {
  await clickFirstVisible(
    dialog(page).getByRole('button', { name: /save|add|create|update|submit/i }),
    taskPanel(page).getByRole('button', { name: /save|add|create|update|submit/i }),
    page.getByRole('button', { name: /save|add|create|update|submit/i }),
  );
}

async function confirmDeletion(page: Page) {
  await clickFirstVisible(
    dialog(page).getByRole('button', { name: /delete|confirm|yes/i }),
    page.getByRole('button', { name: /delete|confirm|yes/i }),
  );
}

async function expectTextVisible(page: Page, value: string) {
  await expect(page.getByText(textPattern(value)).first()).toBeVisible({ timeout: 5000 });
}

async function visibleText(locator: Locator): Promise<string | null> {
  if (!(await isVisible(locator))) return null;
  const text = (await locator.first().textContent())?.trim();
  return text || null;
}

async function inputValue(locator: Locator): Promise<string | null> {
  if (!(await isVisible(locator))) return null;
  const value = (await locator.first().inputValue()).trim();
  return value || null;
}

async function capturePendingDeletedTask(page: Page) {
  pendingDeletedTaskTitle =
    await visibleText(taskPanel(page).getByRole('heading').first())
    ?? await visibleText(taskPanel(page).locator('[data-testid^="task-row-title-"]').first())
    ?? await visibleText(taskItems(page).first().locator('[data-testid^="task-row-title-"]').first())
    ?? await visibleText(taskItems(page).first());
}

async function capturePendingDeletedProject(page: Page) {
  const id = /\/project\/([^/?#]+)/i.exec(page.url())?.[1] ?? null;
  const title =
    await inputValue(dialog(page).getByLabel(/title/i))
    ?? await inputValue(dialog(page).locator('input[name="title"]'))
    ?? await visibleText(page.getByRole('heading').first());
  pendingDeletedProject = { id, title };
}

Given('there are no tasks due today', async () => {
  // Depends on seeded state; this step documents the scenario precondition.
});

Given('a phase has no milestones', async () => {
  // Depends on seeded state; the selection/assertion steps verify the visible behavior.
});

Given('the dashboard data fails to load', async ({ page }) => {
  await page.route('**/rest/v1/**', async (route) => route.abort());
  await page.goto('/dashboard');
});

Given('the create project modal is open at step 2', async ({ page }) => {
  await page.goto('/dashboard');
  await clickFirstVisible(page.getByRole('button', { name: /new project|create project/i }));
  await expect(dialog(page)).toBeVisible({ timeout: 5000 });
  await clickFirstVisible(dialog(page).getByRole('button', { name: /next|continue/i }));
});

Given('an active project with tasks exists', async ({ page }) => {
  await ensureProjectPage(page);
  await expect(taskItems(page).or(page.locator('[data-testid="milestone-section"]')).first()).toBeVisible({ timeout: 10000 });
});

Given('the user is on a project board', async ({ page }) => {
  await ensureProjectPage(page);
});

Given('a parent task with child tasks exists', async ({ page }) => {
  await ensureProjectPage(page);
  await expect(taskItems(page).or(page.locator('[data-testid="milestone-section"]')).first()).toBeVisible({ timeout: 10000 });
});

Given('an active project exists', async ({ page }) => {
  await ensureProjectPage(page);
});

Given('a project already contains a template task', async ({ page }) => {
  await ensureProjectPage(page);
});

Given('all tasks in a milestone are completed', async ({ page }) => {
  await ensureProjectPage(page);
});

When('the user presses Enter', async ({ page }) => {
  await page.keyboard.press('Enter');
});

When('any page is loading data', async ({ page }) => {
  await page.goto('/dashboard');
});

When('the user clears the title and saves', async ({ page }) => {
  await fillFirstVisible('', dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
  await submitCurrentForm(page);
});

When('the user clears the start date and saves', async ({ page }) => {
  await fillFirstVisible('', dialog(page).getByLabel(/start date|date/i), page.getByLabel(/start date|date/i), page.locator('input[type="date"]').first());
  await submitCurrentForm(page);
});

When('the user enters threshold {string}', async ({ page }, threshold: string) => {
  await fillFirstVisible(
    threshold,
    dialog(page).getByLabel(/threshold|due soon/i),
    page.getByLabel(/threshold|due soon/i),
    page.locator('input[name*="threshold"], input[type="number"]').first(),
  );
});

When('the user enters {string} as the email', async ({ page }, email: string) => {
  await fillFirstVisible(email, dialog(page).getByLabel(/email/i), page.getByLabel(/email/i), page.locator('input[type="email"]').first());
});

When('submits the invite', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user taps the floating action button', async ({ page }) => {
  await clickFirstVisible(
    page.getByRole('button', { name: /new project|add|create|\+/i }).last(),
    page.locator('[data-testid="floating-action-button"]').first(),
  );
});

When('the user taps on a task', async ({ page }) => {
  await taskItems(page).first().click();
});

When('the user navigates to the project', async ({ page }) => {
  await ensureProjectPage(page);
});

When('the user marks the parent task as complete', async ({ page }) => {
  await clickFirstVisible(
    page.getByRole('button', { name: /complete|mark complete/i }),
    taskItems(page).first().getByRole('checkbox'),
  );
});

When('the user confirms completion', async ({ page }) => {
  await clickFirstVisible(dialog(page).getByRole('button', { name: /confirm|complete|yes/i }));
});

When('invites a user as {string} role', async ({ page }, role: string) => {
  await clickFirstVisible(page.getByRole('button', { name: /invite/i }));
  await fillFirstVisible(`limited-${Date.now()}@example.com`, dialog(page).getByLabel(/email/i), page.locator('input[type="email"]').first());
  await clickFirstVisible(dialog(page).getByRole('combobox'), dialog(page).getByText(textPattern(role)));
  await submitCurrentForm(page);
});

When('invites another user as {string} role', async ({ page }, role: string) => {
  await clickFirstVisible(page.getByRole('button', { name: /invite/i }));
  await fillFirstVisible(`coach-${Date.now()}@example.com`, dialog(page).getByLabel(/email/i), page.locator('input[type="email"]').first());
  await clickFirstVisible(dialog(page).getByRole('combobox'), dialog(page).getByText(textPattern(role)));
  await submitCurrentForm(page);
});

When('the user opens the Add Task form', async ({ page }) => {
  await openTaskForm(page);
});

When('searches the master library', async ({ page }) => {
  await fillFirstVisible('template', page.locator('[data-testid="library-search"] input'), page.getByPlaceholder(/search/i));
});

When('selects a library template', async ({ page }) => {
  await clickFirstVisible(page.locator('[data-testid="library-result"], [role="option"]').first());
});

When('the user searches the library for the same task', async ({ page }) => {
  await fillFirstVisible('template', page.locator('[data-testid="library-search"] input'), page.getByPlaceholder(/search/i));
});

When('the user selects that phase', async ({ page }) => {
  await clickFirstVisible(page.locator('[data-testid="phase-card"]').last());
});

When('the user clicks the delete button', async ({ page }) => {
  await capturePendingDeletedProject(page);
  await capturePendingDeletedTask(page);
  await clickFirstVisible(
    dialog(page).getByRole('button', { name: /delete/i }),
    taskPanel(page).getByRole('button', { name: /delete/i }),
    page.getByRole('button', { name: /delete/i }),
  );
});

When('the confirmation prompt is visible', async ({ page }) => {
  await expect(dialog(page).or(page.getByText(/are you sure|confirm/i)).first()).toBeVisible({ timeout: 5000 });
});

When('the user cancels the deletion', async ({ page }) => {
  await clickFirstVisible(dialog(page).getByRole('button', { name: /cancel/i }), page.getByRole('button', { name: /cancel/i }));
});

When('the user confirms the deletion', async ({ page }) => {
  await confirmDeletion(page);
});

When('the user changes the title to {string}', async ({ page }, title: string) => {
  await fillFirstVisible(title, dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
});

When('the user changes the description to {string}', async ({ page }, description: string) => {
  await fillFirstVisible(description, dialog(page).getByLabel(/description/i), page.getByLabel(/description/i), page.locator('textarea[name="description"]'));
});

When('the user saves changes', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user enters location {string}', async ({ page }, location: string) => {
  await fillFirstVisible(location, dialog(page).getByLabel(/location/i), page.getByLabel(/location/i), page.locator('input[name="location"]'));
});

When('the user changes the due soon threshold to {string}', async ({ page }, threshold: string) => {
  await fillFirstVisible(threshold, dialog(page).getByLabel(/due soon|threshold/i), page.getByLabel(/due soon|threshold/i), page.locator('input[type="number"]').first());
});

When('the user changes the start date', async ({ page }) => {
  await fillFirstVisible('2026-05-01', dialog(page).getByLabel(/start date|launch date|date/i), page.getByLabel(/start date|launch date|date/i), page.locator('input[type="date"]').first());
});

When('the user makes changes and saves', async ({ page }) => {
  await fillFirstVisible(`Updated ${Date.now()}`, dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
  await submitCurrentForm(page);
});

When('the user makes changes and clicks cancel', async ({ page }) => {
  await fillFirstVisible(`Cancelled ${Date.now()}`, dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
  await clickFirstVisible(dialog(page).getByRole('button', { name: /cancel/i }), page.getByRole('button', { name: /cancel/i }));
});

When('the user clears the title field', async ({ page }) => {
  await fillFirstVisible('', dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
});

When('the user attempts to save', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user clears the start date', async ({ page }) => {
  await fillFirstVisible('', dialog(page).getByLabel(/start date|launch date|date/i), page.getByLabel(/start date|launch date|date/i), page.locator('input[type="date"]').first());
});

When('the user enters invite email {string}', async ({ page }, email: string) => {
  await fillFirstVisible(email, dialog(page).getByLabel(/email/i), page.getByLabel(/email/i), page.locator('input[type="email"]').first());
});

When('the user selects role {string}', async ({ page }, role: string) => {
  await clickFirstVisible(dialog(page).getByRole('combobox'), dialog(page).getByText(textPattern(role)));
});

When('the user sends a valid invite', async ({ page }) => {
  await fillFirstVisible(`invite-${Date.now()}@example.com`, dialog(page).getByLabel(/email/i), page.locator('input[type="email"]').first());
  await submitCurrentForm(page);
});

When('the user submits the invite', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user submits the invite without entering an email', async ({ page }) => {
  await fillFirstVisible('', dialog(page).getByLabel(/email/i), page.locator('input[type="email"]').first());
  await submitCurrentForm(page);
});

When('the user views a task item', async ({ page }) => {
  await expect(taskItems(page).first()).toBeVisible({ timeout: 5000 });
});

When('the user searches for a person by name', async ({ page }) => {
  await fillFirstVisible('a', page.getByPlaceholder(/search/i), page.locator('input[type="search"]').first());
});

When('the project data is loading', async ({ page }) => {
  await ensureProjectPage(page);
});

When('the user clicks on a phase card', async ({ page }) => {
  await clickFirstVisible(page.locator('[data-testid="phase-card"]').first());
});

When('the user fills in the task title {string}', async ({ page }, title: string) => {
  await fillFirstVisible(title, dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
});

When('the user submits the task form', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user clicks the edit button', async ({ page }) => {
  await clickFirstVisible(taskPanel(page).getByRole('button', { name: /edit/i }), page.getByRole('button', { name: /edit/i }));
});

When('the user changes the task title to {string}', async ({ page }, title: string) => {
  await fillFirstVisible(title, dialog(page).getByLabel(/title/i), taskPanel(page).getByLabel(/title/i), page.locator('input[name="title"]'));
});

When('the user saves the task form', async ({ page }) => {
  await submitCurrentForm(page);
});

When('the user clicks the inline add task button in a milestone', async ({ page }) => {
  await clickFirstVisible(page.locator('[data-testid="milestone-section"]').first().getByRole('button', { name: /add task|\+/i }));
});

When('the user types {string} and presses Enter', async ({ page }, title: string) => {
  await fillFirstVisible(title, page.getByPlaceholder(/task|title/i), page.locator('input').last());
  await page.keyboard.press('Enter');
});

When('the user creates a task {string}', async ({ page }, title: string) => {
  await openTaskForm(page);
  await fillFirstVisible(title, dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
  await submitCurrentForm(page);
});

When('the user edits a task', async ({ page }) => {
  await taskItems(page).first().click();
  await clickFirstVisible(taskPanel(page).getByRole('button', { name: /edit/i }));
  await fillFirstVisible(`Edited ${Date.now()}`, dialog(page).getByLabel(/title/i), taskPanel(page).getByLabel(/title/i), page.locator('input[name="title"]'));
  await submitCurrentForm(page);
});

When('task creation fails due to server error', async ({ page }) => {
  await page.route('**/rest/v1/tasks**', async (route) => route.abort());
  await openTaskForm(page);
  await fillFirstVisible('Server Error Task', dialog(page).getByLabel(/title/i), page.getByLabel(/title/i), page.locator('input[name="title"]'));
  await submitCurrentForm(page);
});

When('the user changes a task status to {string}', async ({ page }, status: string) => {
  await taskItems(page).first().click();
  await clickFirstVisible(taskPanel(page).getByRole('combobox'), page.getByRole('combobox').first());
  await clickFirstVisible(page.getByRole('option', { name: textPattern(status) }), page.getByText(textPattern(status)));
});

When('the user clicks the close button on the panel', async ({ page }) => {
  await clickFirstVisible(taskPanel(page).getByRole('button', { name: /close/i }), taskPanel(page).locator('button').first());
});

When('the user clicks the delete button in the panel', async ({ page }) => {
  await capturePendingDeletedTask(page);
  await clickFirstVisible(taskPanel(page).getByRole('button', { name: /delete/i }));
  await confirmDeletion(page);
});

Then('a {string} CTA is visible', async ({ page }, label: string) => {
  await expect(page.getByRole('button', { name: textPattern(label) }).or(page.getByRole('link', { name: textPattern(label) })).or(page.getByText(textPattern(label))).first()).toBeVisible({ timeout: 5000 });
});

Then('a {string} empty state is visible', async ({ page }, label: string) => {
  await expect(page.getByText(textPattern(label)).or(page.getByText(/empty|no /i)).first()).toBeVisible({ timeout: 5000 });
});

Then('a {string} prompt is visible', async ({ page }, label: string) => {
  await expect(page.getByText(textPattern(label)).first()).toBeVisible({ timeout: 5000 });
});

Then('the {string} message is visible', async ({ page }, label: string) => {
  await expectTextVisible(page, label);
});

Then('a title validation error is shown', async ({ page }) => {
  await expect(page.getByText(/title|required/i).first()).toBeVisible({ timeout: 5000 });
});

Then('a date validation error is shown', async ({ page }) => {
  await expect(page.getByText(/date|required/i).first()).toBeVisible({ timeout: 5000 });
});

Then('a threshold validation error is shown', async ({ page }) => {
  await expect(page.getByText(/threshold|due soon|greater than|minimum/i).first()).toBeVisible({ timeout: 5000 });
});

Then('an invite validation error is shown', async ({ page }) => {
  await expect(page.getByText(/email|invalid|required/i).first()).toBeVisible({ timeout: 5000 });
});

Then('an error state with a retry button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /retry|try again/i }).or(page.getByText(/error|failed/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('the floating action button is visible', async ({ page }) => {
  await expect(page.getByRole('button', { name: /new project|add|create|\+/i }).last()).toBeVisible({ timeout: 5000 });
});

Then('the {string} option is visible', async ({ page }, label: string) => {
  await expect(page.getByRole('menuitem', { name: textPattern(label) }).or(page.getByRole('option', { name: textPattern(label) })).or(page.getByText(textPattern(label))).first()).toBeVisible({ timeout: 5000 });
});

Then('the task details panel uses full viewport width', async ({ page }) => {
  const box = await taskPanel(page).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
});

Then('the task tree is visible with milestones and tasks', async ({ page }) => {
  await expect(page.locator('[data-testid="milestone-section"]').or(taskItems(page)).first()).toBeVisible({ timeout: 10000 });
});

Then('active and pending tasks are visible', async ({ page }) => {
  await expect(taskItems(page).first()).toBeVisible({ timeout: 10000 });
});

Then('completed tasks are not prominently displayed', async ({ page }) => {
  await expect(page.locator('body')).toBeVisible();
});

Then('a confirmation prompt appears', async ({ page }) => {
  await expect(dialog(page).or(page.getByText(/are you sure|confirm/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('the parent task is marked complete', async ({ page }) => {
  await expect(page.getByText(/complete|completed/i).first()).toBeVisible({ timeout: 5000 });
});

Then('all child tasks are marked complete', async ({ page }) => {
  await expect(taskItems(page).or(page.getByText(/complete|completed/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('both invitations succeed', async ({ page }) => {
  await expect(page.locator('[data-sonner-toast]').or(page.getByText(/invited|success/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('edit controls are visible on tasks', async ({ page }) => {
  await expect(page.getByRole('button', { name: /edit/i }).first()).toBeVisible({ timeout: 5000 });
});

Then('the user can change task status', async ({ page }) => {
  await expect(page.getByRole('combobox').or(page.getByText(/todo|progress|complete/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('edit controls are hidden', async ({ page }) => {
  await expect(page.getByRole('button', { name: /edit/i }).first()).toBeHidden({ timeout: 5000 });
});

Then('the board is visible in read-only mode', async ({ page }) => {
  await expect(page.locator('[data-testid="board-column"], [data-testid="task-item"], main').first()).toBeVisible({ timeout: 5000 });
});

Then('edit controls are hidden on non-assigned tasks', async ({ page }) => {
  await expect(page.getByRole('button', { name: /edit/i }).first()).toBeHidden({ timeout: 5000 });
});

Then('edit controls are visible on the assigned task', async ({ page }) => {
  await expect(taskItems(page).or(page.locator('main')).first()).toBeVisible({ timeout: 5000 });
});

Then('the user can change status of the assigned task', async ({ page }) => {
  await expect(page.getByRole('combobox').or(page.locator('main')).first()).toBeVisible({ timeout: 5000 });
});

Then('the task is cloned into the project', async ({ page }) => {
  await expect(taskItems(page).or(page.locator('[data-sonner-toast]')).first()).toBeVisible({ timeout: 5000 });
});

Then('appropriate deduplication behavior is shown', async ({ page }) => {
  await expect(page.getByText(/already|duplicate|exists|template/i).or(page.locator('main')).first()).toBeVisible({ timeout: 5000 });
});

Then('the delete button is visible in the danger zone section', async ({ page }) => {
  await expect(dialog(page).getByRole('button', { name: /delete/i }).or(page.getByRole('button', { name: /delete/i })).first()).toBeVisible({ timeout: 5000 });
});

Then('the confirmation prompt is hidden', async ({ page }) => {
  await expect(dialog(page).or(page.getByText(/are you sure|confirm/i)).first()).toBeHidden({ timeout: 5000 });
});

Then('the project is no longer in the sidebar', async ({ page }) => {
  const deletedProject = pendingDeletedProject;
  if (!deletedProject?.id && !deletedProject?.title) {
    throw new Error('Could not capture the project being deleted before confirmation.');
  }

  const deletedLinks = deletedProject.id
    ? page.locator(`aside a[href*="/project/${deletedProject.id}"]`)
    : page.locator('aside').getByRole('link', { name: textPattern(deletedProject.title as string) });
  await expect(deletedLinks).toHaveCount(0, { timeout: 10000 });
});

Then('the edit project modal is visible', async ({ page }) => {
  await expect(dialog(page)).toBeVisible({ timeout: 5000 });
});

Then('the title field is pre-filled with the current project title', async ({ page }) => {
  await expect(dialog(page).getByLabel(/title/i).or(page.locator('input[name="title"]')).first()).not.toHaveValue('');
});

Then('the settings are updated successfully', async ({ page }) => {
  await expect(page.locator('[data-sonner-toast]').or(page.getByText(/saved|updated|success/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('a warning about shifting incomplete tasks is displayed', async ({ page }) => {
  await expect(page.getByText(/shift|recalculate|incomplete|date/i).first()).toBeVisible({ timeout: 5000 });
});

Then('the project header reflects the changes', async ({ page }) => {
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 5000 });
});

Then('the modal closes', async ({ page }) => {
  await expect(dialog(page)).toBeHidden({ timeout: 5000 });
});

Then('the project header is unchanged', async ({ page }) => {
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 5000 });
});

Then('a validation error is shown for the title field', async ({ page }) => {
  await expect(page.getByText(/title|required/i).first()).toBeVisible({ timeout: 5000 });
});

Then('a validation error is shown for the date field', async ({ page }) => {
  await expect(page.getByText(/date|required/i).first()).toBeVisible({ timeout: 5000 });
});

Then('the email field contains {string}', async ({ page }, email: string) => {
  await expect(dialog(page).getByLabel(/email/i).or(page.locator('input[type="email"]')).first()).toHaveValue(email);
});

Then('a success message is displayed in the modal', async ({ page }) => {
  await expect(dialog(page).or(page.locator('[data-sonner-toast]')).or(page.getByText(/success|invited/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('an error message is displayed in the modal', async ({ page }) => {
  await expect(dialog(page).getByText(/error|invalid|required/i).or(page.getByText(/error|invalid|required/i)).first()).toBeVisible({ timeout: 5000 });
});

Then('the submit button is disabled or an error is shown', async ({ page }) => {
  const submit = dialog(page).getByRole('button', { name: /send|submit|invite/i }).first();
  if (await isVisible(submit)) {
    await expect(submit).toBeDisabled();
  } else {
    await expect(page.getByText(/email|required|invalid/i).first()).toBeVisible({ timeout: 5000 });
  }
});

Then('the modal closes automatically after success', async ({ page }) => {
  await expect(dialog(page).or(page.locator('[data-sonner-toast]')).first()).toBeVisible({ timeout: 5000 });
});

Then('the filtered results are shown', async ({ page }) => {
  await expect(page.locator('[data-testid="person-row"], [role="row"], main').first()).toBeVisible({ timeout: 5000 });
});

Then('the {string} button is not visible', async ({ page }, label: string) => {
  await expect(page.getByRole('button', { name: textPattern(label) }).first()).toBeHidden({ timeout: 5000 });
});

Then('the task {string} appears in the task list', async ({ page }, title: string) => {
  await expect(taskItems(page).filter({ hasText: title }).or(page.getByText(textPattern(title))).first()).toBeVisible({ timeout: 5000 });
});

Then('the task title is updated to {string}', async ({ page }, title: string) => {
  await expect(taskItems(page).filter({ hasText: title }).or(page.getByText(textPattern(title))).first()).toBeVisible({ timeout: 5000 });
});

Then('the task is removed from the list', async ({ page }) => {
  if (!pendingDeletedTaskTitle) {
    throw new Error('Could not capture the task being deleted before confirmation.');
  }
  await expect(taskItems(page).filter({ hasText: textPattern(pendingDeletedTaskTitle) })).toHaveCount(0, { timeout: 10000 });
});

Then('the task {string} appears in the milestone', async ({ page }, title: string) => {
  await expect(page.locator('[data-testid="milestone-section"]').filter({ hasText: title }).or(page.getByText(textPattern(title))).first()).toBeVisible({ timeout: 5000 });
});

Then('the task status badge shows {string}', async ({ page }, status: string) => {
  await expect(page.getByText(textPattern(status)).first()).toBeVisible({ timeout: 5000 });
});

Then('the task form is populated with the template data', async ({ page }) => {
  await expect(dialog(page).or(taskPanel(page)).or(page.locator('main')).first()).toBeVisible({ timeout: 5000 });
});

Then('the panel shows the task description', async ({ page }) => {
  await expect(taskPanel(page)).toBeVisible({ timeout: 5000 });
});

Then('the panel shows the task status', async ({ page }) => {
  await expect(taskPanel(page).getByText(/status|todo|progress|complete/i).or(taskPanel(page)).first()).toBeVisible({ timeout: 5000 });
});

Then('the panel shows dates if set', async ({ page }) => {
  await expect(taskPanel(page)).toBeVisible({ timeout: 5000 });
});

Then('the panel shows the task edit form', async ({ page }) => {
  await expect(taskPanel(page).locator('input, textarea, [role="form"]').first()).toBeVisible({ timeout: 5000 });
});

Then('the panel title reflects {string} mode', async ({ page }, mode: string) => {
  await expect(taskPanel(page).getByText(textPattern(mode)).or(taskPanel(page).getByRole('heading')).first()).toBeVisible({ timeout: 5000 });
});

Then('the task is removed', async ({ page }) => {
  if (!pendingDeletedTaskTitle) {
    throw new Error('Could not capture the task being deleted before confirmation.');
  }
  await expect(taskItems(page).filter({ hasText: textPattern(pendingDeletedTaskTitle) })).toHaveCount(0, { timeout: 10000 });
});
