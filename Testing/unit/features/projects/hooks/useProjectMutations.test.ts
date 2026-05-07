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
// ---------------------------------------------------------------------------
describe('useUpdateProject', () => {
  it('updates project without date cascading', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { title: 'Updated Title' },
      });
    });

    expect(mockProjectUpdate).toHaveBeenCalledWith('proj-1', expect.objectContaining({ title: 'Updated Title' }));
    expect(mockTaskFilter).not.toHaveBeenCalled();
  });

  it('cascades dates when start_date changes', async () => {
    const tasks = [
      makeTask({ id: 'proj-1', parent_task_id: null, start_date: '2026-01-01', due_date: '2026-01-01', is_complete: false }),
      makeTask({ id: 't1', parent_task_id: 'proj-1', start_date: '2026-01-10', due_date: '2026-01-20', is_complete: false }),
    ];
    mockTaskFilter.mockResolvedValueOnce(tasks);
    mockProjectUpdate.mockResolvedValue(makeTask());
    mockTaskUpsert.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { start_date: '2026-01-06' },
        oldStartDate: '2026-01-01',
      });
    });

    expect(mockTaskFilter).toHaveBeenCalledWith({ root_id: 'proj-1' });
    expect(mockProjectUpdate).toHaveBeenNthCalledWith(1, 'proj-1', expect.objectContaining({
      due_date: '2026-01-23',
    }));
    expect(mockTaskUpsert).toHaveBeenCalledTimes(2);
    const dueOnlyArg = mockTaskUpsert.mock.calls[0][0] as Array<{ id: string; due_date?: string; start_date?: string }>;
    expect(dueOnlyArg).toEqual([expect.objectContaining({ id: 't1', due_date: '2026-01-23' })]);
    expect(dueOnlyArg[0]).not.toHaveProperty('start_date');
    const fullUpsertArg = mockTaskUpsert.mock.calls[1][0] as Array<{ id: string }>;
    expect(fullUpsertArg.map((u) => u.id)).toEqual(['t1']);
    expect(mockProjectUpdate).toHaveBeenLastCalledWith('proj-1', expect.objectContaining({
      start_date: '2026-01-06',
      due_date: '2026-01-23',
    }));
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

  it('returns shiftedCount: 0 when start_date is unchanged', async () => {
    mockProjectUpdate.mockResolvedValueOnce(makeTask());
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    let returned: { shiftedCount: number } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { title: 'Rename only' },
      });
    });

    expect(returned).toEqual({ shiftedCount: 0 });
    expect(mockTaskFilter).not.toHaveBeenCalled();
    expect(mockTaskUpsert).not.toHaveBeenCalled();
  });

  it('returns shiftedCount matching incomplete tasks and skips completed ones', async () => {
    const tasks = [
      makeTask({ id: 'proj-1', parent_task_id: null, start_date: '2026-01-01', due_date: '2026-01-01', is_complete: false }),
      makeTask({ id: 't1', parent_task_id: 'proj-1', start_date: '2026-01-10', due_date: '2026-01-20', is_complete: false }),
      makeTask({ id: 't2', parent_task_id: 'proj-1', start_date: '2026-01-12', due_date: '2026-01-22', is_complete: false }),
      makeTask({ id: 't3', parent_task_id: 'proj-1', start_date: '2026-01-14', due_date: '2026-01-24', is_complete: false }),
      makeTask({ id: 't4', parent_task_id: 'proj-1', start_date: '2026-01-16', due_date: '2026-01-26', is_complete: true }),
    ];
    mockTaskFilter.mockResolvedValueOnce(tasks);
    mockProjectUpdate.mockResolvedValue(makeTask());
    mockTaskUpsert.mockResolvedValue({ data: [], error: null });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateProject(), { wrapper: Wrapper });

    let returned: { shiftedCount: number } | undefined;
    await act(async () => {
      returned = await result.current.mutateAsync({
        projectId: 'proj-1',
        updates: { start_date: '2026-01-08' },
        oldStartDate: '2026-01-01',
      });
    });

    expect(returned).toEqual({ shiftedCount: 3 });
    expect(mockTaskUpsert).toHaveBeenCalledTimes(2);
    const upsertArg = mockTaskUpsert.mock.calls[1][0] as Array<{ id: string }>;
    expect(upsertArg).toHaveLength(3);
    expect(upsertArg.map(u => u.id).sort()).toEqual(['t1', 't2', 't3']);
  });
});

// ---------------------------------------------------------------------------
// useDeleteProject
// ---------------------------------------------------------------------------
describe('useDeleteProject', () => {
  it('calls Project.delete', async () => {
    mockProjectDelete.mockResolvedValueOnce(true);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteProject(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync('proj-1');
    });

    expect(mockProjectDelete).toHaveBeenCalledWith('proj-1');
  });

  it('invalidates global project keys on success', async () => {
    mockProjectDelete.mockResolvedValueOnce(true);
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
