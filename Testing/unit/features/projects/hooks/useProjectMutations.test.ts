import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
  useSetProjectArchived,
} from '@/features/projects/hooks/useProjectMutations';
import { makeTask } from '@test';

// Mock planterClient
const mockProjectCreate = vi.fn();
const mockProjectUpdate = vi.fn();
const mockProjectDelete = vi.fn();
const mockTaskClone = vi.fn();
const mockTaskFilter = vi.fn();
const mockTaskUpsert = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    auth: {
      me: vi.fn().mockResolvedValue({ id: 'user-1' }),
    },
    entities: {
      Project: {
        create: (...args: unknown[]) => mockProjectCreate(...args),
        update: (...args: unknown[]) => mockProjectUpdate(...args),
        delete: (...args: unknown[]) => mockProjectDelete(...args),
      },
      Task: {
        clone: (...args: unknown[]) => mockTaskClone(...args),
        filter: (...args: unknown[]) => mockTaskFilter(...args),
        upsert: (...args: unknown[]) => mockTaskUpsert(...args),
      },
    },
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// useCreateProject
// ---------------------------------------------------------------------------
describe('useCreateProject', () => {
  it('creates project without template', async () => {
    const project = makeTask({ id: 'new-proj', title: 'My Project' });
    mockProjectCreate.mockResolvedValueOnce(project);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'My Project', start_date: '2026-01-01' });
    });

    expect(mockProjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'My Project', creator: 'user-1' }),
    );
    expect(mockTaskClone).not.toHaveBeenCalled();
  });

  it('clones template without inventing a root due date when templateId provided', async () => {
    const cloned = makeTask({ id: 'cloned-proj' });
    mockTaskClone.mockResolvedValueOnce({ data: cloned, error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        title: 'From Template',
        description: 'Cloned project description',
        templateId: 'tmpl-1',
        start_date: '2026-01-01',
      });
    });

    expect(mockTaskClone).toHaveBeenCalledWith(
      'tmpl-1',
      null,
      'instance',
      'user-1',
      expect.objectContaining({
        title: 'From Template',
        description: 'Cloned project description',
        start_date: '2026-01-01',
      }),
    );
    const cloneOverrides = mockTaskClone.mock.calls[0][4] as Record<string, unknown>;
    expect(cloneOverrides).not.toHaveProperty('due_date');
    expect(mockProjectCreate).not.toHaveBeenCalled();
  });

  it('invalidates project query keys on success', async () => {
    mockProjectCreate.mockResolvedValueOnce(makeTask());
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Test' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['projects'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['userProjects'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['allTasks'] }));
  });
});

// ---------------------------------------------------------------------------
// useUpdateProject
//
// Project dates are governed by the envelope roll-up: due_date is derived (never
// written from the client) and start_date moves the whole project via the
// `reschedule_project_start` RPC (anchored subtree shift), not a direct column
// write. Non-date fields still go through Project.update. These tests assert
// that split and the absence of client-side cascade work.
// ---------------------------------------------------------------------------
describe('useUpdateProject', () => {
  it('updates project root with the provided payload', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { title: 'Updated Title' },
      });
    });

    expect(mockProjectUpdate).toHaveBeenCalledTimes(1);
    expect(mockProjectUpdate).toHaveBeenCalledWith('proj-1', expect.objectContaining({ title: 'Updated Title' }));
  });

  it('does not fetch project tasks or fan out client-side cascade writes', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    mockRpc.mockResolvedValueOnce({ error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { start_date: '2026-01-06' },
      });
    });

    // The reschedule RPC shifts the subtree in the DB. The hook must not
    // re-introduce client-side cascade logic.
    expect(mockTaskFilter).not.toHaveBeenCalled();
    expect(mockTaskUpsert).not.toHaveBeenCalled();
    expect(mockRpc).toHaveBeenCalledWith('reschedule_project_start', {
      p_root_id: 'proj-1',
      p_new_start: '2026-01-06',
    });
  });

  it('routes start_date through the reschedule RPC, never as a Project.update column', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    mockRpc.mockResolvedValueOnce({ error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { start_date: '2026-01-06', due_date: '2026-02-01' },
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('reschedule_project_start', {
      p_root_id: 'proj-1',
      p_new_start: '2026-01-06',
    });
    // due_date is derived and start_date is RPC-driven — neither is written as
    // a column on the root.
    const updateArg = (mockProjectUpdate.mock.calls[0]?.[1] ?? {}) as Record<string, unknown>;
    expect(updateArg).not.toHaveProperty('start_date');
    expect(updateArg).not.toHaveProperty('due_date');
  });

  it('invalidates project-specific query keys on success', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ projectId: 'proj-1', updates: { title: 'X' } });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['project', 'proj-1'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['projectHierarchy', 'proj-1'] }));
  });
});

// ---------------------------------------------------------------------------
// useDeleteProject
// ---------------------------------------------------------------------------
describe('useDeleteProject', () => {
  it('calls the delete_task RPC with the project id', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('proj-1');
    });

    expect(mockRpc).toHaveBeenCalledWith('delete_task', { p_task_id: 'proj-1' });
  });

  it('invalidates global project keys on success', async () => {
    mockRpc.mockResolvedValueOnce({ error: null });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useDeleteProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('proj-1');
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['projects'] }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['allTasks'] }));
  });
});

// ---------------------------------------------------------------------------
// useSetProjectArchived
// ---------------------------------------------------------------------------
describe('useSetProjectArchived', () => {
  it('archives projects through the visibility-only mutation', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask({ status: 'archived' }));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useSetProjectArchived(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ projectId: 'proj-1', archived: true });
    });

    expect(mockProjectUpdate).toHaveBeenCalledWith('proj-1', { status: 'archived' });
  });

  it('unarchives projects without accepting arbitrary lifecycle statuses', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask({ status: 'in_progress' }));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useSetProjectArchived(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ projectId: 'proj-1', archived: false });
    });

    expect(mockProjectUpdate).toHaveBeenCalledWith('proj-1', { status: 'in_progress' });
  });

  it('invalidates project keys on success', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useSetProjectArchived(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ projectId: 'proj-1', archived: true });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ['project', 'proj-1'] }));
  });
});

// ---------------------------------------------------------------------------
// Phase 5c: Edge cases
// ---------------------------------------------------------------------------
describe('useCreateProject — template clone failure', () => {
  it('handles template clone failure gracefully', async () => {
    mockTaskClone.mockResolvedValueOnce({ data: null, error: new Error('Clone failed') });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync({ title: 'Fail', templateId: 'tmpl-bad' });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});

describe('useDeleteProject — error handling', () => {
  it('surfaces deletion error', async () => {
    mockProjectDelete.mockRejectedValueOnce(new Error('delete failed'));
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteProject(), { wrapper: Wrapper });

    await act(async () => {
      try {
        await result.current.mutateAsync('proj-fail');
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
  });
});
