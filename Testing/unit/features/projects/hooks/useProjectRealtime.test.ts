import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----
type OnCallback = (payload: Record<string, unknown>) => void;

let capturedOnCallback: OnCallback | null = null;
const mockRemoveChannel = vi.fn();
const mockChannel: Record<string, unknown> = {
  on: vi.fn((_type: string, _filter: unknown, cb: OnCallback) => {
    capturedOnCallback = cb;
    return mockChannel;
  }),
  subscribe: vi.fn(() => mockChannel),
};

vi.mock('@/shared/db/client', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...args),
  },
}));

vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

import { useProjectRealtime } from '@/features/projects/hooks/useProjectRealtime';
import { supabase } from '@/shared/db/client';

let testQueryClient: QueryClient;

function createWrapper() {
  testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: testQueryClient }, children);
}

describe('useProjectRealtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedOnCallback = null;
    // Reset the .on mock to recapture callback each test
    (mockChannel.on as ReturnType<typeof vi.fn>).mockImplementation((_type: string, _filter: unknown, cb: OnCallback) => {
      capturedOnCallback = cb;
      return mockChannel;
    });
  });

  describe('channel setup', () => {
    it('creates channel with project-specific name when projectId provided', () => {
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      expect(supabase.channel).toHaveBeenCalledWith('db-changes:project-proj-1');
    });

    it('creates global channel when no projectId', () => {
      renderHook(() => useProjectRealtime(null), { wrapper: createWrapper() });

      expect(supabase.channel).toHaveBeenCalledWith('db-changes:global');
    });

    it('creates global channel with default parameter', () => {
      renderHook(() => useProjectRealtime(), { wrapper: createWrapper() });

      expect(supabase.channel).toHaveBeenCalledWith('db-changes:global');
    });

    it('subscribes on mount', () => {
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('removes channel on unmount', () => {
      const { unmount } = renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });
  });

  describe('filter configuration', () => {
    it('filters by root_id when projectId is provided', () => {
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'root_id=eq.proj-1',
        }),
        expect.any(Function),
      );
    });

    it('filters by creator when no projectId but userId exists', () => {
      renderHook(() => useProjectRealtime(null), { wrapper: createWrapper() });

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          filter: 'creator=eq.user-1',
        }),
        expect.any(Function),
      );
    });
  });

  describe('payload handling', () => {
    it('invalidates scoped task-tree queries on non-root task events', () => {
      const invalidateSpy = vi.spyOn(testQueryClient || new QueryClient(), 'invalidateQueries');
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      // Non-root task: id !== root_id, parent_task_id is a milestone (not null).
      // Post-Phase-2: realtime should NOT invalidate ['projects'] / ['project']
      // in this case — that invalidation used to fan out O(N) refetches during
      // bulk ops (template clone).
      const spy = vi.spyOn(testQueryClient, 'invalidateQueries');

      capturedOnCallback!({
        new: {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          root_id: 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b',
          parent_task_id: 'c5d4e3f2-a1b0-4c6d-9e8f-7a6b5c4d3e2f',
        },
      });

      const invalidatedKeys = spy.mock.calls.map(call => (call[0] as { queryKey: string[] }).queryKey);
      expect(invalidatedKeys).toContainEqual(['tasks', 'tree', 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b']);
      expect(invalidatedKeys).toContainEqual(['projectHierarchy', 'f1e2d3c4-b5a6-4978-8a6b-5c4d3e2f1a0b']);
      expect(invalidatedKeys).toContainEqual(['task', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d']);
      // Intentionally NOT present on non-root task events:
      expect(invalidatedKeys).not.toContainEqual(['projects']);
      expect(invalidatedKeys).not.toContainEqual(['project', 'proj-1']);

      invalidateSpy.mockRestore();
      spy.mockRestore();
    });

    it('invalidates project-scoped keys when the changed row is a root task', () => {
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });
      const spy = vi.spyOn(testQueryClient, 'invalidateQueries');

      // Root task: id === root_id (the project itself was touched — rename,
      // status flip, etc.) OR parent_task_id === null. Either triggers a
      // projects-list refresh so Dashboard cards reflect the change.
      capturedOnCallback!({
        new: {
          id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          root_id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          parent_task_id: null,
        },
      });

      const invalidatedKeys = spy.mock.calls.map(call => (call[0] as { queryKey: string[] }).queryKey);
      expect(invalidatedKeys).toContainEqual(['projects']);
      expect(invalidatedKeys).toContainEqual(['project', 'proj-1']);
      expect(invalidatedKeys).toContainEqual(['task', 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e']);

      spy.mockRestore();
    });

    it('logs error when payload fails Zod validation', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      renderHook(() => useProjectRealtime('proj-1'), { wrapper: createWrapper() });

      // Send a payload where both .new and .old are falsy — parse(undefined) will throw
      capturedOnCallback!({});

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Realtime] Payload violated Zod contract:',
        expect.anything(),
      );

      consoleSpy.mockRestore();
    });

    it('does not invalidate project-specific key when no projectId', () => {
      renderHook(() => useProjectRealtime(null), { wrapper: createWrapper() });
      const spy = vi.spyOn(testQueryClient, 'invalidateQueries');

      capturedOnCallback!({
        new: { id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e' },
      });

      const invalidatedKeys = spy.mock.calls.map(call => (call[0] as { queryKey: string[] }).queryKey);
      // Should NOT have project-specific invalidation
      const hasProjectKey = invalidatedKeys.some(k => k[0] === 'project' && k.length === 2);
      expect(hasProjectKey).toBe(false);

      spy.mockRestore();
    });
  });

  describe('channel lifecycle on rerender', () => {
    it('recreates channel when projectId changes', () => {
      const { rerender } = renderHook(
        ({ pid }) => useProjectRealtime(pid),
        { initialProps: { pid: 'proj-1' as string | null }, wrapper: createWrapper() },
      );

      expect(supabase.channel).toHaveBeenCalledWith('db-changes:project-proj-1');

      rerender({ pid: 'proj-2' });

      // Should remove old channel and create new one
      expect(mockRemoveChannel).toHaveBeenCalled();
      expect(supabase.channel).toHaveBeenCalledWith('db-changes:project-proj-2');
    });
  });
});
