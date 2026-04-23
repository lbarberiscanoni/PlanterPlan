import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '@/shared/i18n';
import { ConfirmDialogProvider } from '@/shared/ui/confirm-dialog';
import type { TaskRow } from '@/shared/db/app.types';

// ---- Mocks ----
const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
const mockDeleteMutate = vi.fn();

vi.mock('@/features/tasks/hooks/useTaskMutations', () => ({
  useCreateTask: () => ({ mutate: mockMutate, mutateAsync: mockMutateAsync }),
  useUpdateTask: () => ({ mutate: mockMutate }),
  useDeleteTask: () => ({ mutate: mockDeleteMutate }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Stub useConfirm so tests can drive the dialog resolver directly. Default
// is "user confirms" — tests override via `mockConfirmResult` before acting.
// Note the ConfirmDialogProvider is still rendered (via the test wrapper) so
// the surrounding context exists; we override the hook only.
let mockConfirmResult = true;
vi.mock('@/shared/ui/confirm-dialog', async (orig) => {
  const actual = await orig() as typeof import('@/shared/ui/confirm-dialog');
  return {
    ...actual,
    useConfirm: () => vi.fn().mockImplementation(() => Promise.resolve(mockConfirmResult)),
  };
});

import { useProjectBoard } from '@/features/projects/hooks/useProjectBoard';
import { toast } from 'sonner';

function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: overrides.id ?? 'task-1',
    title: overrides.title ?? 'Test Task',
    description: null,
    notes: null,
    purpose: null,
    actions: null,
    status: 'todo',
    origin: 'instance',
    creator: 'user-1',
    assignee_id: null,
    parent_task_id: overrides.parent_task_id ?? null,
    parent_project_id: null,
    root_id: overrides.root_id ?? 'project-1',
    position: overrides.position ?? 10000,
    is_complete: false,
    is_locked: false,
    is_premium: false,
    days_from_start: null,
    start_date: null,
    due_date: null,
    location: null,
    priority: null,
    project_type: null,
    prerequisite_phase_id: null,
    primary_resource_id: null,
    settings: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as TaskRow;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  // `useProjectBoard` now consumes i18n (for `t(...)` in confirm-dialog copy)
  // and the `ConfirmDialogProvider` (replaces `window.confirm`). The wrapper
  // mirrors the app-level provider stack so these hooks resolve in tests.
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        I18nextProvider,
        { i18n },
        React.createElement(ConfirmDialogProvider, null, children),
      ),
    );
}

describe('useProjectBoard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({});
  });

  const projectId = 'project-1';

  describe('initial state', () => {
    it('has correct default values', () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      expect(result.current.state.activeTab).toBe('board');
      expect(result.current.state.selectedPhase).toBeNull();
      expect(result.current.state.selectedTask).toBeNull();
      expect(result.current.state.showInviteModal).toBe(false);
      expect(result.current.state.inlineAddingParentId).toBeNull();
    });
  });

  describe('actions', () => {
    it('setActiveTab updates activeTab', () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.actions.setActiveTab('list');
      });

      expect(result.current.state.activeTab).toBe('list');
    });

    it('setSelectedPhase updates selectedPhase', () => {
      const task = makeTask({ id: 'phase-1' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.actions.setSelectedPhase(task);
      });

      expect(result.current.state.selectedPhase).toEqual(task);
    });

    it('setShowInviteModal toggles invite modal', () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.actions.setShowInviteModal(true);
      });

      expect(result.current.state.showInviteModal).toBe(true);
    });
  });

  describe('handleTaskClick', () => {
    it('sets selectedTask', () => {
      const task = makeTask({ id: 'clicked-task' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.handlers.handleTaskClick(task);
      });

      expect(result.current.state.selectedTask).toEqual(task);
    });
  });

  describe('handleTaskUpdate', () => {
    it('calls mutate with correct payload', () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.handlers.handleTaskUpdate('task-1', { status: 'completed' });
      });

      expect(mockMutate).toHaveBeenCalledWith(
        { id: 'task-1', status: 'completed', root_id: projectId },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it('calls toast.error on mutation error', () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      act(() => {
        result.current.handlers.handleTaskUpdate('task-1', { status: 'completed' });
      });

      // Extract the onError callback and invoke it
      const onError = mockMutate.mock.calls[0][1].onError;
      act(() => {
        onError(new Error('Update failed'));
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to update task', { description: 'Update failed' });
    });
  });

  describe('handleToggleExpand', () => {
    it('adds ID when expanding', () => {
      const task = makeTask({ id: 'expand-me' });
      const tasks = [task];
      const { result } = renderHook(() => useProjectBoard(projectId, tasks), { wrapper: createWrapper() });

      act(() => {
        result.current.handlers.handleToggleExpand(task, true);
      });

      // Verify expansion via mapTaskWithState
      const mapped = result.current.computed.mapTaskWithState(task);
      expect(mapped.isExpanded).toBe(true);
    });

    it('removes ID when collapsing', () => {
      const task = makeTask({ id: 'collapse-me' });
      const tasks = [task];
      const { result } = renderHook(() => useProjectBoard(projectId, tasks), { wrapper: createWrapper() });

      // Expand first
      act(() => {
        result.current.handlers.handleToggleExpand(task, true);
      });

      // Collapse
      act(() => {
        result.current.handlers.handleToggleExpand(task, false);
      });

      const mapped = result.current.computed.mapTaskWithState(task);
      expect(mapped.isExpanded).toBe(false);
    });
  });

  describe('handleStartInlineAdd', () => {
    it('sets inlineAddingParentId and expands parent', () => {
      const parent = makeTask({ id: 'parent-1' });
      const tasks = [parent];
      const { result } = renderHook(() => useProjectBoard(projectId, tasks), { wrapper: createWrapper() });

      act(() => {
        result.current.handlers.handleStartInlineAdd(parent);
      });

      expect(result.current.state.inlineAddingParentId).toBe('parent-1');
      // mapTaskWithState should reflect isAddingInline
      const mapped = result.current.computed.mapTaskWithState(parent);
      expect(mapped.isAddingInline).toBe(true);
      expect(mapped.isExpanded).toBe(true);
    });
  });

  describe('handleInlineCommit', () => {
    it('creates task with correct payload and clears inlineAddingParentId', async () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleInlineCommit('parent-1', 'New Task');
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Task',
        root_id: projectId,
        parent_task_id: 'parent-1',
        origin: 'instance',
        priority: 'medium',
        is_complete: false,
        description: '',
        notes: '',
        purpose: '',
        actions: '',
      }));
      expect(result.current.state.inlineAddingParentId).toBeNull();
    });

    it('spreads templateData fields when provided', async () => {
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleInlineCommit('parent-1', 'Templated Task', {
          description: 'Template desc',
          notes: 'Template notes',
          purpose: 'Template purpose',
          actions: 'Template actions',
        } as Partial<TaskRow>);
      });

      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        description: 'Template desc',
        notes: 'Template notes',
        purpose: 'Template purpose',
        actions: 'Template actions',
      }));
    });

    it('calls toast.error on failure', async () => {
      mockMutateAsync.mockRejectedValue(new Error('Create failed'));
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleInlineCommit('parent-1', 'Failing Task');
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to create task');
    });
  });

  describe('handleDeleteTask', () => {
    it('calls mutate when user confirms', async () => {
      mockConfirmResult = true;
      const task = makeTask({ id: 'delete-me', title: 'Doomed Task' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleDeleteTask(task);
      });

      expect(mockDeleteMutate).toHaveBeenCalledWith(
        { id: 'delete-me', root_id: projectId },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      );
    });

    it('does not call mutate when user cancels', async () => {
      mockConfirmResult = false;
      const task = makeTask({ id: 'keep-me' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleDeleteTask(task);
      });

      expect(mockDeleteMutate).not.toHaveBeenCalled();
    });

    it('onSuccess clears selectedTask and toasts', async () => {
      mockConfirmResult = true;
      const task = makeTask({ id: 'delete-me' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      // Select the task first
      act(() => {
        result.current.handlers.handleTaskClick(task);
      });
      expect(result.current.state.selectedTask).not.toBeNull();

      await act(async () => {
        await result.current.handlers.handleDeleteTask(task);
      });

      // Invoke onSuccess callback
      const onSuccess = mockDeleteMutate.mock.calls[0][1].onSuccess;
      act(() => {
        onSuccess();
      });

      expect(result.current.state.selectedTask).toBeNull();
      expect(toast.success).toHaveBeenCalledWith('Task deleted');
    });

    it('onError calls toast.error', async () => {
      mockConfirmResult = true;
      const task = makeTask({ id: 'delete-me' });
      const { result } = renderHook(() => useProjectBoard(projectId), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handlers.handleDeleteTask(task);
      });

      const onError = mockDeleteMutate.mock.calls[0][1].onError;
      act(() => {
        onError(new Error('Delete failed'));
      });

      expect(toast.error).toHaveBeenCalledWith('Failed to delete task', { description: 'Delete failed' });
    });
  });

  describe('mapTaskWithState', () => {
    it('builds nested tree with children sorted by position', () => {
      const parent = makeTask({ id: 'parent', position: 1000 });
      const child1 = makeTask({ id: 'child-1', parent_task_id: 'parent', position: 20000 });
      const child2 = makeTask({ id: 'child-2', parent_task_id: 'parent', position: 10000 });
      const tasks = [parent, child1, child2];

      const { result } = renderHook(() => useProjectBoard(projectId, tasks), { wrapper: createWrapper() });

      const mapped = result.current.computed.mapTaskWithState(parent);
      expect((mapped.children as unknown[]).length).toBe(2);
      // child2 (position 10000) should come before child1 (position 20000)
      expect((mapped.children as Array<{ id: string }>)[0].id).toBe('child-2');
      expect((mapped.children as Array<{ id: string }>)[1].id).toBe('child-1');
    });

    it('prevents circular references with visited set', () => {
      // A task that is its own parent (shouldn't happen, but the code guards against it)
      const selfRef = makeTask({ id: 'self', parent_task_id: 'self' });
      const tasks = [selfRef];

      const { result } = renderHook(() => useProjectBoard(projectId, tasks), { wrapper: createWrapper() });

      // Should not stack overflow
      const mapped = result.current.computed.mapTaskWithState(selfRef);
      expect(mapped.id).toBe('self');
    });
  });
});
