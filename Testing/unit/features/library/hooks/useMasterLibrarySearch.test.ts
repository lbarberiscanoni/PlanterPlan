import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListAllVisibleTemplates = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      TaskWithResources: { listAllVisibleTemplates: (...args: unknown[]) => mockListAllVisibleTemplates(...args) },
    },
  },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: { id: 'test-user-id' } }),
}));

import { useMasterLibrarySearch } from '@/features/library/hooks/useMasterLibrarySearch';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const templates = [
  { id: 't1', title: 'Church Launch', description: 'Full launch plan' },
  { id: 't2', title: 'Outreach Campaign', description: 'Community outreach' },
  { id: 't3', title: 'Worship Team', description: null },
];

describe('useMasterLibrarySearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAllVisibleTemplates.mockResolvedValue(templates);
  });

  it('fetches visible templates with viewerId', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockListAllVisibleTemplates).toHaveBeenCalledWith('test-user-id');
    expect(result.current.results).toEqual(templates);
  });

  it('returns all templates when query is empty', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch({ query: '' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(3));
  });

  it('filters by title (case-insensitive)', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch({ query: 'church' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].id).toBe('t1');
  });

  it('filters by description (case-insensitive)', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch({ query: 'community' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].id).toBe('t2');
  });

  it('returns empty results when no match', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch({ query: 'zzz' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.hasResults).toBe(false);
  });

  it('trims whitespace from query', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch({ query: '  worship  ' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].id).toBe('t3');
  });

  it('hasResults is true when results exist', async () => {
    const { result } = renderHook(() => useMasterLibrarySearch(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.hasResults).toBe(true));
  });

  it('does not fetch when enabled is false', async () => {
    const { result } = renderHook(
      () => useMasterLibrarySearch({ enabled: false }),
      { wrapper: createWrapper() },
    );

    // Give time for potential fetch
    await new Promise(r => setTimeout(r, 50));
    expect(mockListAllVisibleTemplates).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });
});
