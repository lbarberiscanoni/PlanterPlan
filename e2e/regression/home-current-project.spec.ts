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
