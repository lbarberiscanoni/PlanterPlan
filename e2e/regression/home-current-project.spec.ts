import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

/**
 * REG — the project-centric Home (`/home`) is data-bound to a *current project*
 * and persists the chosen project across a full reload. @regression @projects
 *
 * Guards the Home rebuild (Patrick's dashboard mockup):
 *   - `/` and `/dashboard` now land on `/home` (previously redirected to `/tasks`).
 *   - the hero card renders a real project title + the Launch Phases / Milestones
 *     sections from live data, not a static shell.
 *   - the "current project" is a net-new localStorage primitive (`useCurrentProject`)
 *     that MUST survive a page reload — the piece most likely to silently regress
 *     (e.g. if the fallback-to-first-project path ever shadows the stored choice).
 *
 * Read-only: creates no data, so no teardown tag is needed.
 */
test('@regression @projects home renders the current project and persists a switch across reload', async ({ page }) => {
  await loginAs(page, 'planter');

  await page.goto('/home');

  const home = page.locator('[data-testid="home-page"]');
  await expect(home).toBeVisible();

  // Data-bound hero — a real project title, not the loading/em-dash placeholder.
  const heroTitle = home.locator('h1').first();
  await expect(heroTitle).toBeVisible();
  const firstTitle = ((await heroTitle.textContent()) ?? '').trim();
  expect(firstTitle.length).toBeGreaterThan(0);
  expect(firstTitle).not.toBe('—');

  // The mockup's core sections are present.
  await expect(page.locator('[data-testid="home-launch-phases"]')).toBeVisible();
  await expect(page.locator('[data-testid="home-milestones-attention"]')).toBeVisible();

  // Switch to a different project via the header control.
  await page.locator('[data-testid="home-switch-project"]').click();
  const menuItems = page.locator('[role="menuitem"]');
  await expect(menuItems.first()).toBeVisible();

  // Pick the first option whose label differs from the current project.
  const count = await menuItems.count();
  let picked: string | null = null;
  for (let i = 0; i < count; i++) {
    const label = ((await menuItems.nth(i).textContent()) ?? '').trim();
    if (label && label !== firstTitle) {
      await menuItems.nth(i).click();
      picked = label;
      break;
    }
  }
  expect(picked, 'planter fixture should expose ≥2 switchable projects').not.toBeNull();

  // Hero re-binds to the newly selected project.
  await expect(heroTitle).not.toHaveText(firstTitle);
  const secondTitle = ((await heroTitle.textContent()) ?? '').trim();
  expect(secondTitle.length).toBeGreaterThan(0);

  // The choice survives a full reload (the localStorage-backed primitive).
  await page.reload();
  const homeAfter = page.locator('[data-testid="home-page"]');
  await expect(homeAfter).toBeVisible();
  await expect(homeAfter.locator('h1').first()).toHaveText(secondTitle);
});

/**
 * REG — stakeholder dashboard follow-up: Home navigation must preserve the
 * destination view rather than falling back to Today's Tasks / the first phase.
 * Read-only: creates no data, so no teardown tag is needed. @regression @projects
 */
test('@regression @projects home links open My Tasks and focus the selected phase', async ({ page }) => {
  await loginAs(page, 'planter');
  await page.goto('/home');

  const home = page.locator('[data-testid="home-page"]');
  await expect(home).toBeVisible();
  await expect(home.getByText('Project Team', { exact: true })).toBeVisible();
  await expect(home.getByText(/\d+ users?/, { exact: true })).toBeVisible();

  await page.locator('[data-testid="home-my-tasks-link"]').click();
  await expect(page).toHaveURL(/\/tasks\?view=my_tasks&project=all$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My Tasks' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Task view' })).toHaveText('My Tasks');
  await expect(page.getByRole('combobox', { name: 'Filter by project' })).toHaveText('All projects');

  await page.goto('/home');
  const phaseLinks = page.locator('[data-testid^="home-phase-link-"]');
  await expect(phaseLinks.first()).toBeVisible();
  const firstPhase = phaseLinks.first();
  const phaseName = ((await firstPhase.locator('[data-testid="home-phase-name"]').textContent()) ?? '').trim();
  const href = await firstPhase.getAttribute('href');
  expect(href).toMatch(/^\/project\/[^?]+\?phase=[^&]+$/);

  await firstPhase.click();
  await expect(page).toHaveURL(/\/project\/[^?]+\?phase=[^&]+$/);
  await expect(page.locator('[data-testid="active-phase-heading"]')).toContainText(phaseName);
});
