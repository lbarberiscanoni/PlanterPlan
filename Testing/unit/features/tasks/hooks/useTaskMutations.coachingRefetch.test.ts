import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateTask } from '@/features/tasks/hooks/useTaskMutations';
import { makeTask } from '@test';

// Wave 23 Task 1: when a mutation flips `settings.is_coaching_task` to true,
// `useUpdateTask` must invalidate the `projectHierarchy` query so the UI
// picks up the auto-assigned coach that the DB trigger set on the row.
// The server row is augmented by the DB trigger (it populates `assignee_id`
// from project_members); the hook's job here is to force a refetch on
// success so the client cache reflects that server-side write.

const mockUpdate = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Task: {
        create: vi.fn(),
        update: (...args: unknown[]) => mockUpdate(...args),
        delete: vi.fn(),
        updateStatus: vi.fn(),
        updateParentDates: vi.fn(),
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

describe('useUpdateTask — coaching flag refetch (Wave 23 Task 1)', () => {
  it('invalidates projectHierarchy after flipping is_coaching_task to true', async () => {
    const updated = makeTask({
      id: 't1',
      root_id: 'proj-1',
      settings: { is_coaching_task: true },
      assignee_id: 'coach-user-id',
    });
    mockUpdate.mockResolvedValueOnce(updated);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 't1',
        root_id: 'proj-1',
        settings: { is_coaching_task: true },
      });
    });

    // The trigger assigns assignee_id server-side; the hook forces a refetch
    // so the client-cached row picks up that write.
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['projectHierarchy', 'proj-1'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['task', 't1'] }),
    );
  });

  it('only invalidates the per-task key when no root_id is supplied', async () => {
    // Post-follow-up cleanup: the dead `['tasks', 'root']` fallback key was
    // removed from useUpdateTask.onSettled (no consumer reads it). With no
    // rootId, only the per-task cache is invalidated; hierarchy/projects
    // refetches don't fire until a rootId is in play.
    const updated = makeTask({ id: 't2', settings: { is_coaching_task: true } });
    mockUpdate.mockResolvedValueOnce(updated);

    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useUpdateTask(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 't2',
        settings: { is_coaching_task: true },
      });
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    );
    expect(invalidatedKeys).toContainEqual(['task', 't2']);
    expect(invalidatedKeys).not.toContainEqual(['tasks', 'root']);
  });
});
