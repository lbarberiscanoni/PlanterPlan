import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTaskQuery } from '@/features/tasks/hooks/useTaskQuery';
import { makeTask } from '@test';

// Mock planterClient
const mockListByCreator = vi.fn();
const mockTaskFilter = vi.fn();
const mockListJoined = vi.fn();
let mockAuthUser: { id: string } | null = { id: 'user-1' };

vi.mock('@/shared/api/planterClient', () => ({
  planter: {
    entities: {
      Project: {
        listByCreator: (...args: unknown[]) => mockListByCreator(...args),
        listJoined: (...args: unknown[]) => mockListJoined(...args),
      },
      Task: {
        filter: (...args: unknown[]) => mockTaskFilter(...args),
      },
    },
  },
}));

// Mock useAuth
vi.mock('@/shared/contexts/auth-context', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = { id: 'user-1' };
  // Default: return empty data
  mockListByCreator.mockResolvedValue([]);
  mockTaskFilter.mockResolvedValue([]);
  mockListJoined.mockResolvedValue([]);
});

describe('useTaskQuery', () => {
  it('returns merged tasks from projects and templates', async () => {
    const project = makeTask({ id: 'proj-1', origin: 'instance' });
    const template = makeTask({ id: 'tmpl-1', origin: 'template' });
    mockListByCreator.mockResolvedValue([project]);
    mockTaskFilter.mockResolvedValue([template]);
    mockListJoined.mockResolvedValue([]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks.map(t => t.id)).toContain('proj-1');
    expect(result.current.tasks.map(t => t.id)).toContain('tmpl-1');
  });

  it('returns joined projects separately', async () => {
    const joined = makeTask({ id: 'joined-1' });
    mockListJoined.mockResolvedValue([joined]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.joinedLoading).toBe(false);
    });

    expect(result.current.joinedProjects).toHaveLength(1);
    expect(result.current.joinedProjects[0].id).toBe('joined-1');
  });

  it('findTask locates task by ID across all sources', async () => {
    const project = makeTask({ id: 'proj-1' });
    const joined = makeTask({ id: 'joined-1' });
    mockListByCreator.mockResolvedValue([project]);
    mockListJoined.mockResolvedValue([joined]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.findTask('proj-1')?.id).toBe('proj-1');
    expect(result.current.findTask('joined-1')?.id).toBe('joined-1');
    expect(result.current.findTask('nonexistent')).toBeNull();
  });

  it('exposes per-section loading states', async () => {
    // Initially all should be loading
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    // At minimum, projectsLoading starts true
    expect(result.current.projectsLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.projectsLoading).toBe(false);
    });
  });

  it('exposes currentUserId from auth', async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    expect(result.current.currentUserId).toBe('user-1');
  });

  it('propagates error from projects query', async () => {
    mockListByCreator.mockRejectedValue(new Error('fetch failed'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe('fetch failed');
    });
  });

  it('reports hasMore based on page size', async () => {
    // Return exactly PAGE_SIZE (20) items to indicate more pages
    const fullPage = Array.from({ length: 20 }, (_, i) => makeTask({ id: `p-${i}` }));
    mockListByCreator.mockResolvedValue(fullPage);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
  });

  it('reports no more pages when partial page returned', async () => {
    mockListByCreator.mockResolvedValue([makeTask()]);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it('disables queries when currentUserId is null', async () => {
    mockAuthUser = null;

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useTaskQuery(), { wrapper: Wrapper });

    // With null user, queries should not fire
    expect(result.current.currentUserId).toBeNull();
    expect(mockListByCreator).not.toHaveBeenCalled();

    mockAuthUser = { id: 'user-1' };
  });
});
