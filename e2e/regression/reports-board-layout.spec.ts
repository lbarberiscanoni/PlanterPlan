import { test, expect } from '@playwright/test';
import { loginAs } from '../support/auth';

const REPORT_PROJECT_ID = '33f4158f-d985-4c07-9d78-e646285705be';

test('@regression @reports Board report uses chart-only status summary and expandable milestone details', async ({ page }) => {
  await loginAs(page, 'planter');
  await page.goto(`/reports?project=${REPORT_PROJECT_ID}`);

  const statusChart = page.getByTestId('report-task-status-chart');
  await expect(statusChart).toBeVisible();
  await expect(page.getByTestId('report-task-status-legend').locator('li')).toHaveCount(4);

  const phaseDetails = page.getByRole('heading', { name: 'Phase Details', exact: true });
  const milestoneDetails = page.getByTestId('report-milestone-details');
  await expect(phaseDetails).toBeVisible();
  await expect(milestoneDetails.getByRole('heading', { name: 'Milestone Details', exact: true })).toBeVisible();

  const phaseBox = await phaseDetails.boundingBox();
  const milestoneBox = await milestoneDetails.boundingBox();
  expect(phaseBox).not.toBeNull();
  expect(milestoneBox).not.toBeNull();
  expect(milestoneBox?.y).toBeGreaterThan(phaseBox?.y ?? 0);

  await expect(page.getByTestId('report-milestone-details-sections')).not.toHaveClass(/overflow-y-auto|max-h-/);
});
