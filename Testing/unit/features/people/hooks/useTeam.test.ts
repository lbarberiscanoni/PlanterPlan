import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----
const mockProjectGet = vi.fn();
const mockListTeamMembersWithProfiles = vi.fn();
const mockInviteMemberByEmail = vi.fn();
const mockTeamMemberDelete = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Project: {
        get: (...args: unknown[]) => mockProjectGet(...args),
        inviteMemberByEmail: (...args: unknown[]) => mockInviteMemberByEmail(...args),
      },
      TeamMember: {
        listByProjectWithProfiles: (...args: unknown[]) => mockListTeamMembersWithProfiles(...args),
        delete: (...args: unknown[]) => mockTeamMemberDelete(...args),
      },
    },
  },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'current-user-1' } }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { useTeam } from '@/features/people/hooks/useTeam';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTeam', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectGet.mockResolvedValue({ id: 'p1', title: 'Test Project', origin: 'instance', parent_task_id: null });
    mockListTeamMembersWithProfiles.mockResolvedValue([
      { id: 'm1', project_id: 'p1', user_id: 'u1', role: 'editor', email: 'u1@example.com' },
    ]);
  });

  it('fetches hydrated team members filtered by projectId', async () => {
    const { result } = renderHook(() => useTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListTeamMembersWithProfiles).toHaveBeenCalledWith('p1');
    expect(result.current.teamMembers).toHaveLength(1);
  });

  it('does not fetch team members when projectId is null', async () => {
    const { result } = renderHook(() => useTeam(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListTeamMembersWithProfiles).not.toHaveBeenCalled();
    expect(result.current.teamMembers).toEqual([]);
  });

  it('fetches project data when projectId is provided', async () => {
    const { result } = renderHook(() => useTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.project).toBeDefined();
    });
    expect(mockProjectGet).toHaveBeenCalledWith('p1');
  });

  it('does not fetch project when projectId is null', async () => {
    renderHook(() => useTeam(null), { wrapper: createWrapper() });

    await new Promise(r => setTimeout(r, 50));
    expect(mockProjectGet).not.toHaveBeenCalled();
  });

  it('does not call the roster RPC for template roots', async () => {
    mockProjectGet.mockResolvedValue({ id: 'tmpl-1', title: 'Template Root', origin: 'template', parent_task_id: null });

    const { result } = renderHook(() => useTeam('tmpl-1'), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockProjectGet).toHaveBeenCalledWith('tmpl-1');
    });

    expect(mockListTeamMembersWithProfiles).not.toHaveBeenCalled();
    expect(result.current.teamMembers).toEqual([]);
  });

  it('deleteMember calls delete and invalidates queries', async () => {
    mockTeamMemberDelete.mockResolvedValue({});

    const { result } = renderHook(() => useTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.mutations.deleteMember.mutate('m1');
    });

    await waitFor(() => {
      expect(mockTeamMemberDelete).toHaveBeenCalledWith('m1');
    });
  });

  it('addMember delegates to the owner-only email invite path', async () => {
    mockInviteMemberByEmail.mockResolvedValue({ message: 'ok', user: { id: 'u3', email: 'new@example.com' } });

    const { result } = renderHook(() => useTeam('p1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      result.current.mutations.addMember.mutate({
        project_id: 'p1',
        name: 'New Member',
        email: 'new@example.com',
        role: 'editor',
      });
    });

    await waitFor(() => {
      expect(mockInviteMemberByEmail).toHaveBeenCalledWith('p1', 'new@example.com', 'editor');
    });
  });

  it('defaults teamMembers to empty array', () => {
    mockListTeamMembersWithProfiles.mockResolvedValue(undefined);
    const { result } = renderHook(() => useTeam('p1'), { wrapper: createWrapper() });
    expect(result.current.teamMembers).toEqual([]);
  });
});
