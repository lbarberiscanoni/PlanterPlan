import type { Page, Locator } from '@playwright/test';

export class ProjectPage {
  readonly page: Page;
  readonly projectTitle: Locator;
  readonly statusBadge: Locator;
  readonly progressBar: Locator;
  readonly backButton: Locator;
  readonly phaseCards: Locator;
  readonly milestones: Locator;
  readonly taskItems: Locator;
  readonly addTaskButton: Locator;
  readonly settingsButton: Locator;
  readonly exportButton: Locator;
  readonly reportsButton: Locator;
  readonly teamButton: Locator;
  readonly inviteButton: Locator;
  readonly tabs: Locator;
  readonly spinner: Locator;
  readonly taskDetailsPanel: Locator;

  constructor(page: Page) {
    this.page = page;
    this.projectTitle = page.getByRole('heading', { level: 1 }).or(page.getByRole('heading', { level: 2 })).first();
    this.statusBadge = page.locator('[data-testid="project-derived-state-badge"]');
    this.progressBar = page.locator('[role="progressbar"]');
    this.backButton = page.getByRole('link', { name: /back|tasks/i });
    this.phaseCards = page.locator('[data-testid="phase-card"]');
    this.milestones = page.locator('[data-testid="milestone-section"]');
    this.taskItems = page.locator('[data-testid="task-item"]');
    this.addTaskButton = page.getByRole('button', { name: /Add Task/i });
    this.settingsButton = page.getByRole('button', { name: /settings/i });
    this.exportButton = page.getByRole('button', { name: /export/i });
    this.reportsButton = page.getByRole('link', { name: /reports/i });
    this.teamButton = page.getByRole('link', { name: /team/i });
    this.inviteButton = page.getByRole('button', { name: /invite/i });
    this.tabs = page.locator('[role="tab"]');
    this.spinner = page.locator('[data-testid="loading-spinner"]').or(page.getByRole('progressbar'));
    this.taskDetailsPanel = page.locator('[data-testid="task-details-panel"]');
  }

  async goto(projectId: string) {
    await this.page.goto(`/project/${projectId}`);
    await this.page.waitForLoadState('networkidle');
  }

  async getPhaseCards() {
    return this.phaseCards;
  }

  async clickPhase(index: number) {
    await this.phaseCards.nth(index).click();
  }

  async getMilestones() {
    return this.milestones;
  }

  async getTasksInMilestone(milestoneIndex: number) {
    return this.milestones.nth(milestoneIndex).locator('[data-testid="task-item"]');
  }

  async clickTask(taskText: string) {
    await this.page.getByText(taskText).click();
  }

  async clickAddTask() {
    await this.addTaskButton.first().click();
  }

  async clickTab(tabName: string) {
    await this.tabs.filter({ hasText: tabName }).click();
  }

  async getActiveTab() {
    return this.tabs.locator('[aria-selected="true"]');
  }

  async clickSettings() {
    await this.settingsButton.click();
  }

  async clickExport() {
    await this.exportButton.click();
  }

  async clickInvite() {
    await this.inviteButton.click();
  }

  async getProgressBar() {
    return this.progressBar;
  }
}
