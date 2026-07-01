import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';
import { createProjectFromTemplate } from '../support/project';
import { tagged } from '../support/runId';

/**
 * REG-12 — phase cards are numbered by sibling ordinal, not raw `position`. @regression @projects
 *
 * `tasks.position` is stored in 10000-step increments, so a phase at position 10000
 * used to render "Phase 10000" in its number badge (and "Phase 10000: …" in the header).
 * PhaseCard now takes an `order` prop (1-based index). This guards against regressing to
 * the raw position. Found in the 2026-06-30 UX walkthrough.
 */
test('@regression @projects phase number badge shows a small ordinal, not the raw position', async ({ page }) => {
  await loginAs(page, 'planter');
  await createProjectFromTemplate(page, tagged(`Phase numbering ${Date.now()}`));

  const firstBadge = page.locator('[data-testid^="phase-card-order-"]').first();
  await expect(firstBadge).toBeVisible();

  const text = ((await firstBadge.textContent()) ?? '').trim();
  // The first phase is ordinal 1 — and crucially never a 4+ digit position value.
  expect(text).toBe('1');
  expect(text).not.toMatch(/\d{4,}/);
});
