import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListTemplates = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      TaskWithResources: { listTemplates: (...args: unknown[]) => mockListTemplates(...args) },
    },
  },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

import { useMasterLibraryTasks } from '@/features/library/hooks/useMasterLibraryTasks';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useMasterLibraryTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches first page of templates', async () => {
    const page1 = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
    mockListTemplates.mockResolvedValue({ data: page1, error: null });

    const { result } = renderHook(() => useMasterLibraryTasks({ limit: 10 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toHaveLength(10);
    expect(mockListTemplates).toHaveBeenCalledWith({ from: 0, limit: 10, resourceType: 'all', viewerId: 'test-user-id' });
  });

  it('calculates nextPage when data length equals limit', async () => {
    const page = Array.from({ length: 25 }, (_, i) => ({ id: `t${i}` }));
    mockListTemplates.mockResolvedValue({ data: page, error: null });

    const { result } = renderHook(() => useMasterLibraryTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(true);
  });

  it('does not have next page when data length is less than limit', async () => {
    const page = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
    mockListTemplates.mockResolvedValue({ data: page, error: null });

    const { result } = renderHook(() => useMasterLibraryTasks({ limit: 25 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasNextPage).toBe(false);
  });

  it('passes resourceType to API', async () => {
    mockListTemplates.mockResolvedValue({ data: [], error: null });

    renderHook(() => useMasterLibraryTasks({ resourceType: 'video' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(mockListTemplates).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'video' }),
      );
    });
  });

  it('throws error from API', async () => {
    mockListTemplates.mockResolvedValue({ data: null, error: new Error('API error') });

    const { result } = renderHook(() => useMasterLibraryTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.error).toBeTruthy());
  });

  it('returns empty tasks when data is null', async () => {
    mockListTemplates.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useMasterLibraryTasks(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.tasks).toEqual([]);
  });

  it('does not fetch when enabled is false', async () => {
    renderHook(() => useMasterLibraryTasks({ enabled: false }), {
      wrapper: createWrapper(),
    });

    await new Promise(r => setTimeout(r, 50));
    expect(mockListTemplates).not.toHaveBeenCalled();
  });

  it('includes correct query key with limit and resourceType', async () => {
    mockListTemplates.mockResolvedValue({ data: [], error: null });

    const { result } = renderHook(
      () => useMasterLibraryTasks({ limit: 50, resourceType: 'document' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListTemplates).toHaveBeenCalledWith({ from: 0, limit: 50, resourceType: 'document', viewerId: 'test-user-id' });
  });
});
