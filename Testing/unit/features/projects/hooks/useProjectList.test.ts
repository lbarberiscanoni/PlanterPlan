import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----
const mockProjectList = vi.fn().mockResolvedValue([]);
const mockTaskListByCreator = vi.fn().mockResolvedValue([]);
// Phase 2 (perf audit H4): useProjectList now scopes TeamMember by the caller's
// uid via `.filter({ user_id })` instead of unscoped `.list()` — fewer rows,
// O(caller-memberships) not O(tenant-memberships).
const mockTeamMemberFilter = vi.fn().mockResolvedValue([]);

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Project: { list: (...args: unknown[]) => mockProjectList(...args) },
      Task: { listByCreator: (...args: unknown[]) => mockTaskListByCreator(...args) },
      TeamMember: { filter: (...args: unknown[]) => mockTeamMemberFilter(...args) },
    },
  },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, loading: false }),
}));

import { useProjectList } from '@/features/projects/hooks/useProjectList';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useProjectList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectList.mockResolvedValue([]);
    mockTaskListByCreator.mockResolvedValue([]);
    mockTeamMemberFilter.mockResolvedValue([]);
  });

  it('returns loading state initially', () => {
    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });
    expect(result.current.state.isLoading).toBeDefined();
  });

  it('fetches projects, tasks, and team members', async () => {
    const projects = [{ id: 'p1', title: 'Project 1', status: 'in_progress' }];
    const tasks = [{ id: 't1', title: 'Task 1', project_id: 'p1' }];
    const members = [{ id: 'm1', project_id: 'p1' }];

    mockProjectList.mockResolvedValue(projects);
    mockTaskListByCreator.mockResolvedValue(tasks);
    mockTeamMemberFilter.mockResolvedValue(members);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.projects).toEqual(projects);
    });
    expect(result.current.data.allTasks).toEqual(tasks);
    expect(result.current.data.teamMembers).toEqual(members);
  });

  it('filters active projects (excludes completed and archived)', async () => {
    const projects = [
      { id: 'p1', status: 'in_progress', is_complete: false },
      { id: 'p2', status: 'completed', is_complete: true },
      { id: 'p3', status: 'planning', is_complete: false },
      { id: 'p4', status: 'archived', is_complete: false },
    ];
    mockProjectList.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.activeProjects).toHaveLength(2);
    });
    expect(result.current.data.activeProjects.map((p: { id: string }) => p.id)).toEqual(['p1', 'p3']);
  });

  it('exposes archivedProjects containing only status === "archived"', async () => {
    const projects = [
      { id: 'p1', status: 'in_progress', is_complete: false },
      { id: 'p2', status: 'archived', is_complete: false },
      { id: 'p3', status: 'archived', is_complete: false },
      { id: 'p4', status: 'completed', is_complete: true },
    ];
    mockProjectList.mockResolvedValue(projects);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.archivedProjects).toHaveLength(2);
    });
    expect(result.current.data.archivedProjects.map((p: { id: string }) => p.id).sort()).toEqual(['p2', 'p3']);
  });

  it('filters tasks by search query', async () => {
    const tasks = [
      { id: 't1', title: 'Design mockups', description: null },
      { id: 't2', title: 'Build API', description: 'REST endpoints' },
      { id: 't3', title: 'Write tests', description: 'Unit and integration' },
    ];
    mockTaskListByCreator.mockResolvedValue(tasks);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.allTasks).toHaveLength(3);
    });

    act(() => {
      result.current.actions.setSearchQuery('api');
    });

    expect(result.current.data.filteredTasks).toHaveLength(1);
    expect(result.current.data.filteredTasks[0].id).toBe('t2');
  });

  it('search query matches description too', async () => {
    const tasks = [
      { id: 't1', title: 'Task', description: 'Contains integration keyword' },
    ];
    mockTaskListByCreator.mockResolvedValue(tasks);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.allTasks).toHaveLength(1);
    });

    act(() => {
      result.current.actions.setSearchQuery('integration');
    });

    expect(result.current.data.filteredTasks).toHaveLength(1);
  });

  it('filters tasks by selected project', async () => {
    const tasks = [
      { id: 't1', title: 'Task A', project_id: 'p1' },
      { id: 't2', title: 'Task B', project_id: 'p2' },
    ];
    mockTaskListByCreator.mockResolvedValue(tasks);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.allTasks).toHaveLength(2);
    });

    act(() => {
      result.current.actions.setSelectedProjectId('p1');
    });

    expect(result.current.data.filteredTasks).toHaveLength(1);
    expect(result.current.data.filteredTasks[0].id).toBe('t1');
  });

  it('returns all tasks when no project selected and no search query', async () => {
    const tasks = [{ id: 't1', title: 'A' }, { id: 't2', title: 'B' }];
    mockTaskListByCreator.mockResolvedValue(tasks);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.filteredTasks).toHaveLength(2);
    });
  });

  it('handles empty project array gracefully', async () => {
    mockProjectList.mockResolvedValue([]);

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.data.projects).toEqual([]);
      expect(result.current.data.activeProjects).toEqual([]);
    });
  });

  it('returns error state on fetch failure', async () => {
    mockProjectList.mockRejectedValue(new Error('fetch failed'));

    const { result } = renderHook(() => useProjectList(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.state.isError).toBe(true);
    });
  });
});
