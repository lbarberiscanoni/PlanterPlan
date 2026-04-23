import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListByProject = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      TaskResource: {
        listByProject: (...args: unknown[]) => mockListByProject(...args),
      },
    },
  },
}));

import { useProjectResources } from '@/features/projects/hooks/useProjectResources';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useProjectResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListByProject.mockResolvedValue([]);
  });

  it('does not fire the query when projectId is undefined', () => {
    const { result } = renderHook(
      () => useProjectResources(undefined),
      { wrapper: createWrapper() },
    );
    expect(result.current.isFetching).toBe(false);
    expect(mockListByProject).not.toHaveBeenCalled();
  });

  it('passes projectId and an AbortSignal to listByProject', async () => {
    const rows = [
      { id: 'r1', resource_type: 'url', resource_url: 'https://example.com' },
      { id: 'r2', resource_type: 'text', resource_text: 'note' },
    ];
    mockListByProject.mockResolvedValueOnce(rows);

    const { result } = renderHook(
      () => useProjectResources('project-1'),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(rows);
    });

    expect(mockListByProject).toHaveBeenCalledWith(
      'project-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
