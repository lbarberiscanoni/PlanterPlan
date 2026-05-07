import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListAllVisibleTemplates = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      TaskWithResources: {
        listAllVisibleTemplates: (...args: unknown[]) => mockListAllVisibleTemplates(...args),
      },
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

describe('useMasterLibrarySearch — excludeTemplateIds (Wave 22)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAllVisibleTemplates.mockResolvedValue(templates);
  });

  it('removes templates whose ids appear in excludeTemplateIds', async () => {
    const { result } = renderHook(
      () => useMasterLibrarySearch({ excludeTemplateIds: ['t2'] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    const ids = result.current.results.map((t) => t.id);
    expect(ids).not.toContain('t2');
    expect(ids).toEqual(expect.arrayContaining(['t1', 't3']));
  });

  it('sets exclusionDrained=true when exclusion drains a non-empty list', async () => {
    const { result } = renderHook(
      () => useMasterLibrarySearch({ excludeTemplateIds: ['t1', 't2', 't3'] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.exclusionDrained).toBe(true);
  });

  it('leaves exclusionDrained=false when the pre-exclusion list was already empty', async () => {
    mockListAllVisibleTemplates.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useMasterLibrarySearch({ excludeTemplateIds: ['t1'] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.results).toHaveLength(0);
    expect(result.current.exclusionDrained).toBe(false);
  });

  it('leaves exclusionDrained=false when exclusion leaves at least one result', async () => {
    const { result } = renderHook(
      () => useMasterLibrarySearch({ excludeTemplateIds: ['t1'] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.results).toHaveLength(2));
    expect(result.current.exclusionDrained).toBe(false);
  });

  it('still narrows by query after exclusion applies', async () => {
    const { result } = renderHook(
      () => useMasterLibrarySearch({ query: 'worship', excludeTemplateIds: ['t1'] }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.results).toHaveLength(1));
    expect(result.current.results[0].id).toBe('t3');
  });

  it('does not refetch when excludeTemplateIds changes identity', async () => {
    const wrapper = createWrapper();
    const { rerender } = renderHook(
      ({ ids }: { ids: string[] }) => useMasterLibrarySearch({ excludeTemplateIds: ids }),
      {
        wrapper,
        initialProps: { ids: ['t1'] },
      },
    );

    await waitFor(() => expect(mockListAllVisibleTemplates).toHaveBeenCalledTimes(1));

    rerender({ ids: ['t2'] });
    rerender({ ids: ['t1', 't2'] });

    // Still only the one network fetch — exclusion is purely client-side.
    expect(mockListAllVisibleTemplates).toHaveBeenCalledTimes(1);
  });
});
