import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const listTemplateRoots = vi.fn();
const listTemplateClones = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
 planter: {
  admin: {
   listTemplateRoots: (...args: unknown[]) => listTemplateRoots(...args),
   listTemplateClones: (...args: unknown[]) => listTemplateClones(...args),
  },
  entities: {
   Task: {
    list: vi.fn(() => {
     throw new Error('AdminTemplates must use admin RPC wrappers');
    }),
   },
  },
 },
}));

import { renderWithProviders } from '@test/render-with-providers';
import AdminTemplates from '@/pages/admin/AdminTemplates';

describe('AdminTemplates', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  listTemplateRoots.mockResolvedValue([
   { id: 'tpl-1', title: 'Launch Template', template_version: 4, updated_at: '2026-04-23T12:00:00Z' },
  ]);
  listTemplateClones.mockResolvedValue([
   {
    project_id: 'p-1',
    title: 'Alpha Plant',
    cloned_from_template_version: 3,
    current_template_version: 4,
    stale: true,
   },
  ]);
 });

 it('loads template roots and clone drift through admin RPC wrappers', async () => {
  const user = userEvent.setup();
  renderWithProviders(<AdminTemplates />);

  await screen.findByText('Launch Template');
  expect(listTemplateRoots).toHaveBeenCalledOnce();

  await user.click(screen.getByTestId('admin-templates-row-tpl-1'));

  await waitFor(() => {
   expect(listTemplateClones).toHaveBeenCalledWith('tpl-1');
  });
  expect(await screen.findByText('Alpha Plant')).toBeInTheDocument();
  expect(screen.getByText('stale')).toBeInTheDocument();
 });
});
