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
let mockUser = { id: 'planter-user', email: 'planter@example.com', role: 'team' };

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
    mockUser = { id: 'planter-user', email: 'planter@example.com', role: 'team' };
    mockProjectList.mockResolvedValue([{ id: 'p1', title: 'Launch Project' }]);
    mockProjectGet.mockResolvedValue({ id: 'p1', title: 'Launch Project', origin: 'instance', parent_task_id: null });
    mockListTeamMembersWithProfiles.mockResolvedValue([
      {
        id: 'm-planter',
        project_id: 'p1',
        user_id: 'planter-user',
        role: 'planter',
        joined_at: '2026-05-07T00:00:00Z',
        email: 'planter@example.com',
        first_name: 'Planter',
        last_name: 'Person',
        display_name: 'Planter Person',
        avatar_url: null,
      },
      {
        id: 'm-team',
        project_id: 'p1',
        user_id: 'team-user',
        role: 'team',
        joined_at: null,
        email: 'team@example.com',
        first_name: 'Tee',
        last_name: 'Mem',
        display_name: 'Tee Mem',
        avatar_url: null,
      },
    ]);
    mockDeleteMember.mockResolvedValue(true);
  });

  it('renders the selected project roster with hydrated names and roles', async () => {
    renderTeam();

    expect(await screen.findByRole('heading', { name: 'Launch Project Team' })).toBeInTheDocument();
    expect(screen.getByText('Planter Person')).toBeInTheDocument();
    expect(screen.getByText('team@example.com')).toBeInTheDocument();
    // Self-row keeps its role badge; other-row gets the role-change Select instead.
    expect(screen.getByRole('combobox', { name: /change role for tee mem/i })).toBeInTheDocument();
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

  it('hides member-management actions from non-Planter project members', async () => {
    mockUser = { id: 'team-user', email: 'team@example.com', role: 'team' };
    mockListTeamMembersWithProfiles.mockResolvedValue([
      {
        id: 'm-team',
        project_id: 'p1',
        user_id: 'team-user',
        role: 'team',
        joined_at: null,
        email: 'team@example.com',
        first_name: null,
        last_name: null,
        display_name: 'Team Person',
        avatar_url: null,
      },
    ]);

    renderTeam();

    expect(await screen.findByText('Team Person')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('confirms before removing another member', async () => {
    mockUser = { id: 'planter-user', email: 'planter@example.com', role: 'planter' };
    const user = userEvent.setup();
    renderTeam();

    await screen.findByText('Tee Mem');
    await user.click(screen.getByRole('button', { name: 'Remove Tee Mem' }));
    await user.click(await screen.findByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockDeleteMember).toHaveBeenCalledWith('m-team'));
  });
});
