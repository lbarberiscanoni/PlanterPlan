import { MemoryRouter } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@test/render-with-providers';
import Team from '@/pages/Team';

const mockProjectList = vi.fn();
const mockProjectGet = vi.fn();
const mockListTeamMembersWithProfiles = vi.fn();
const mockDeleteMember = vi.fn();
let mockUser = { id: 'owner-user', email: 'owner@example.com', role: 'viewer' };

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Project: {
        list: (...args: unknown[]) => mockProjectList(...args),
        get: (...args: unknown[]) => mockProjectGet(...args),
      },
      TeamMember: {
        listByProjectWithProfiles: (...args: unknown[]) => mockListTeamMembersWithProfiles(...args),
        delete: (...args: unknown[]) => mockDeleteMember(...args),
      },
    },
  },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderTeam(initialPath = '/team?project=p1') {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <Team />
    </MemoryRouter>,
  );
}

describe('Team page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { id: 'owner-user', email: 'owner@example.com', role: 'viewer' };
    mockProjectList.mockResolvedValue([{ id: 'p1', title: 'Launch Project' }]);
    mockProjectGet.mockResolvedValue({ id: 'p1', title: 'Launch Project', origin: 'instance', parent_task_id: null });
    mockListTeamMembersWithProfiles.mockResolvedValue([
      {
        id: 'm-owner',
        project_id: 'p1',
        user_id: 'owner-user',
        role: 'owner',
        joined_at: '2026-05-07T00:00:00Z',
        email: 'owner@example.com',
        first_name: 'Owner',
        last_name: 'Person',
        display_name: 'Owner Person',
        avatar_url: null,
      },
      {
        id: 'm-editor',
        project_id: 'p1',
        user_id: 'editor-user',
        role: 'editor',
        joined_at: null,
        email: 'editor@example.com',
        first_name: 'Ed',
        last_name: 'Itor',
        display_name: 'Ed Itor',
        avatar_url: null,
      },
    ]);
    mockDeleteMember.mockResolvedValue(true);
  });

  it('renders the selected project roster with hydrated names and roles', async () => {
    renderTeam();

    expect(await screen.findByRole('heading', { name: 'Launch Project Team' })).toBeInTheDocument();
    expect(screen.getByText('Owner Person')).toBeInTheDocument();
    expect(screen.getByText('editor@example.com')).toBeInTheDocument();
    expect(screen.getByText('Editor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add member/i })).toBeInTheDocument();
    expect(mockListTeamMembersWithProfiles).toHaveBeenCalledWith('p1');
  });

  it('shows project selection guidance when no project is selected', async () => {
    renderTeam('/team');

    expect(await screen.findByRole('heading', { name: 'Team' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Select a project' })).toBeInTheDocument();
    expect(mockListTeamMembersWithProfiles).not.toHaveBeenCalled();
  });

  it('hides member-management actions from non-owner project members', async () => {
    mockUser = { id: 'viewer-user', email: 'viewer@example.com', role: 'viewer' };
    mockListTeamMembersWithProfiles.mockResolvedValue([
      {
        id: 'm-viewer',
        project_id: 'p1',
        user_id: 'viewer-user',
        role: 'viewer',
        joined_at: null,
        email: 'viewer@example.com',
        first_name: null,
        last_name: null,
        display_name: 'Viewer Person',
        avatar_url: null,
      },
    ]);

    renderTeam();

    expect(await screen.findByText('Viewer Person')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('confirms before removing another member', async () => {
    const user = userEvent.setup();
    renderTeam();

    await screen.findByText('Ed Itor');
    await user.click(screen.getByRole('button', { name: 'Remove Ed Itor' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockDeleteMember).toHaveBeenCalledWith('m-editor'));
  });
});
