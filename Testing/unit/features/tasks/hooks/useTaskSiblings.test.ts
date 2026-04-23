import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListSiblings = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Task: {
        listSiblings: (...args: unknown[]) => mockListSiblings(...args),
      },
    },
  },
}));

import { useTaskSiblings } from '@/features/tasks/hooks/useTaskSiblings';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTaskSiblings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListSiblings.mockResolvedValue([]);
  });

  it('does not fire the query when taskId is missing', () => {
    const { result } = renderHook(
      () => useTaskSiblings(undefined, 'parent-1'),
      { wrapper: createWrapper() },
    );
    expect(result.current.isFetching).toBe(false);
    expect(mockListSiblings).not.toHaveBeenCalled();
  });

  it('does not fire the query when parentTaskId is null (project roots)', () => {
    const { result } = renderHook(
      () => useTaskSiblings('task-1', null),
      { wrapper: createWrapper() },
    );
    expect(result.current.isFetching).toBe(false);
    expect(mockListSiblings).not.toHaveBeenCalled();
  });

  it('calls listSiblings with the task id when both ids are present', async () => {
    mockListSiblings.mockResolvedValueOnce([
      { id: 's1' },
      { id: 's2' },
    ]);
    const { result } = renderHook(
      () => useTaskSiblings('task-1', 'parent-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toHaveLength(2);
    });
    expect(mockListSiblings).toHaveBeenCalledWith('task-1');
  });
});
