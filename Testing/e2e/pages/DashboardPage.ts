import type { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly newProjectButton: Locator;
  readonly newTemplateButton: Locator;
  readonly statsCards: Locator;
  readonly pipelineBoard: Locator;
  readonly pipelineColumns: Locator;
  readonly projectCards: Locator;
  readonly emptyState: Locator;
  readonly spinner: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageTitle = page.getByRole('heading', { level: 1 });
    this.newProjectButton = page.getByRole('button', { name: /New Project/i });
    this.newTemplateButton = page.getByRole('button', { name: /New Template/i });
    this.statsCards = page.locator('[data-testid="stats-card"]').first();
    this.pipelineBoard = page.locator('[data-testid="pipeline-board"]');
    this.pipelineColumns = page.locator('[data-testid="pipeline-column"]');
    this.projectCards = page.locator('[data-testid="project-card"]');
    this.emptyState = page.getByText(/No projects yet|Create Your First/i);
    this.spinner = page.locator('[data-testid="loading-spinner"]').or(page.getByRole('progressbar'));
  }

  async goto() {
    await this.page.goto('/tasks');
    await this.page.waitForLoadState('networkidle');
    await this.dismissOnboardingIfVisible();
  }

  async clickNewProject() {
    await this.newProjectButton.click();
  }

  async clickCreateTemplate() {
    await this.newTemplateButton.click();
  }

  async getStatsCards() {
    return this.statsCards;
  }

  async getPipelineColumns() {
    return this.pipelineColumns;
  }

  async getProjectCards() {
    return this.projectCards;
  }

  async isOnboardingVisible() {
    return this.page.getByText(/Welcome|Get Started/i).isVisible().catch(() => false);
  }

  async dismissOnboardingIfVisible() {
    const onboardingDialog = this.page.getByRole('dialog', { name: /welcome to planterplan/i });
    if (await onboardingDialog.isVisible().catch(() => false)) {
      await this.page.keyboard.press('Escape');
      if (await onboardingDialog.isVisible().catch(() => false)) {
        await onboardingDialog.getByRole('button', { name: /^close$/i }).first().click({ force: true });
      }
      await onboardingDialog.waitFor({ state: 'hidden' });
    }
  }

  async searchProjects(query: string) {
    const searchInput = this.page.getByPlaceholder(/search/i);
    await searchInput.fill(query);
  }
}
