import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateTask, useUpdateTask, useDeleteTask } from '@/features/tasks/hooks/useTaskMutations';
import { makeTask } from '@test';
import type { TaskRow, TaskInsert } from '@/shared/db/app.types';

// Mock planterClient
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Task: {
        create: (...args: unknown[]) => mockCreate(...args),
        update: (...args: unknown[]) => mockUpdate(...args),
        delete: (...args: unknown[]) => mockDelete(...args),
      },
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
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
// useCreateTask
// ---------------------------------------------------------------------------
describe('useCreateTask', () => {
  it('calls Task.create with insert data', async () => {
    const task = makeTask({ root_id: 'proj-1' });
    mockCreate.mockResolvedValueOnce(task);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'New', root_id: 'proj-1' } as TaskInsert);
    });

    expect(mockCreate).toHaveBeenCalledWith({ title: 'New', root_id: 'proj-1' });
  });

  it('invalidates projectHierarchy when root_id present', async () => {
    mockCreate.mockResolvedValueOnce(makeTask({ root_id: 'proj-1' }));
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'New', root_id: 'proj-1' } as TaskInsert);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['projectHierarchy', 'proj-1'] }),
    );
  });

  it('falls back to the returned row\'s root_id when the input lacks one', async () => {
    // Root-task creation: input has no root_id (the DB trigger sets it to
    // the new row's id). The hook should resolve rootId from the returned
    // row and invalidate `['projectHierarchy', <id>]`. The Phase 5 hook
    // change dropped the `['tasks', 'root']` fallback key — no consumer
    // reads that key, so writing to it was dead code (arch audit H5).
    const created = makeTask({ id: 'created-root', root_id: 'created-root' });
    mockCreate.mockResolvedValueOnce(created);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: 'Orphan' } as TaskInsert);
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['projectHierarchy', 'created-root'] }),
    );
  });
});

// ---------------------------------------------------------------------------
// useUpdateTask
// ---------------------------------------------------------------------------
describe('useUpdateTask', () => {
  it('calls Task.update with id and payload', async () => {
    const updated = makeTask({ id: 't1', title: 'Updated' });
    mockUpdate.mockResolvedValueOnce(updated);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 't1', title: 'Updated', root_id: 'proj-1' });
    });

    expect(mockUpdate).toHaveBeenCalledWith('t1', expect.objectContaining({ id: 't1', title: 'Updated' }));
  });

  it('applies optimistic update to projectHierarchy cache', async () => {
    const existing = [makeTask({ id: 't1', title: 'Old', root_id: 'proj-1' })];
    // Delay resolution so we can check optimistic state
    mockUpdate.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(makeTask({ id: 't1', title: 'New' })), 50)));

    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['projectHierarchy', 'proj-1'], existing);

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ id: 't1', title: 'New', root_id: 'proj-1' });
    });

    // Wait for optimistic update to be applied
    await waitFor(() => {
      const cached = queryClient.getQueryData<TaskRow[]>(['projectHierarchy', 'proj-1']);
      expect(cached?.[0]?.title).toBe('New');
    });
  });

  it('rolls back on error', async () => {
    const existing = [makeTask({ id: 't1', title: 'Original', root_id: 'proj-1' })];
    mockUpdate.mockRejectedValueOnce(new Error('fail'));

    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['projectHierarchy', 'proj-1'], existing);

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ id: 't1', title: 'Bad', root_id: 'proj-1' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    // Should rollback to original
    await waitFor(() => {
      const cached = queryClient.getQueryData<TaskRow[]>(['projectHierarchy', 'proj-1']);
      expect(cached?.[0]?.title).toBe('Original');
    });
  });

  it('invalidates task query on settled', async () => {
    mockUpdate.mockResolvedValueOnce(makeTask({ id: 't1' }));
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 't1', root_id: 'proj-1' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['task', 't1'] }),
    );
  });
});

// ---------------------------------------------------------------------------
// useDeleteTask
// ---------------------------------------------------------------------------
describe('useDeleteTask', () => {
  it('calls Task.delete with id', async () => {
    mockDelete.mockResolvedValueOnce(true);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 't1', root_id: 'proj-1' });
    });

    expect(mockDelete).toHaveBeenCalledWith('t1');
  });

  it('optimistically removes task from cache', async () => {
    const existing = [
      makeTask({ id: 't1', root_id: 'proj-1' }),
      makeTask({ id: 't2', root_id: 'proj-1' }),
    ];
    mockDelete.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(true), 50)));

    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['projectHierarchy', 'proj-1'], existing);

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ id: 't1', root_id: 'proj-1' });
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TaskRow[]>(['projectHierarchy', 'proj-1']);
      expect(cached).toHaveLength(1);
      expect(cached?.[0]?.id).toBe('t2');
    });
  });

  it('rolls back on error', async () => {
    const existing = [makeTask({ id: 't1', root_id: 'proj-1' })];
    mockDelete.mockRejectedValueOnce(new Error('fail'));

    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['projectHierarchy', 'proj-1'], existing);

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    act(() => {
      result.current.mutate({ id: 't1', root_id: 'proj-1' });
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    await waitFor(() => {
      const cached = queryClient.getQueryData<TaskRow[]>(['projectHierarchy', 'proj-1']);
      expect(cached).toHaveLength(1);
      expect(cached?.[0]?.id).toBe('t1');
    });
  });

  it('removes individual task query on settled', async () => {
    mockDelete.mockResolvedValueOnce(true);
    const { Wrapper, queryClient } = createWrapper();
    const removeSpy = vi.spyOn(queryClient, 'removeQueries');

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 't1', root_id: 'proj-1' });
    });

    expect(removeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['task', 't1'] }),
    );
  });

  it('skips the optimistic cache write when root_id is null', async () => {
    // Post-follow-up cleanup: the dead `['tasks', 'root']` fallback key
    // was removed from useDeleteTask.onMutate; we now warn in dev and
    // skip the optimistic remove (the server-side delete still fires).
    // Any cache the caller seeds under the old dead key is left untouched.
    const existing = [makeTask({ id: 't1', root_id: null })];
    mockDelete.mockResolvedValue(true);

    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(['tasks', 'root'], existing);

    const { result } = renderHook(() => useDeleteTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: 't1', root_id: null as unknown as string });
    });

    // Dead cache key is untouched by the hook — no optimistic remove.
    const cached = queryClient.getQueryData<TaskRow[]>(['tasks', 'root']);
    expect(cached).toEqual(existing);
    // Server-side delete still invoked.
    expect(mockDelete).toHaveBeenCalledWith('t1');
  });
});
