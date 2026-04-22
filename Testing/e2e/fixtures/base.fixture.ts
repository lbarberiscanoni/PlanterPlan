/* eslint-disable react-hooks/rules-of-hooks, no-empty-pattern */
import { test as base } from 'playwright-bdd';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ProjectPage } from '../pages/ProjectPage';
import { TasksPage } from '../pages/TasksPage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TeamPage } from '../pages/TeamPage';
import { AUTH_STATES } from './test-data';

/** Extended test fixture with all Page Object Models */
export const test = base.extend<{
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  projectPage: ProjectPage;
  tasksPage: TasksPage;
  reportsPage: ReportsPage;
  settingsPage: SettingsPage;
  teamPage: TeamPage;
}>({
  storageState: async ({}, use) => {
    await use(AUTH_STATES.user);
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  projectPage: async ({ page }, use) => {
    await use(new ProjectPage(page));
  },
  tasksPage: async ({ page }, use) => {
    await use(new TasksPage(page));
  },
  reportsPage: async ({ page }, use) => {
    await use(new ReportsPage(page));
  },
  settingsPage: async ({ page }, use) => {
    await use(new SettingsPage(page));
  },
  teamPage: async ({ page }, use) => {
    await use(new TeamPage(page));
  },
});
