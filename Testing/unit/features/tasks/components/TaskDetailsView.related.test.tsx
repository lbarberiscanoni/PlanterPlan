import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskRow } from '@/shared/db/app.types';
import type { TaskItemData } from '@/shared/types/tasks';

// ---- Mocks (declared BEFORE import of the component under test) ----

const mockUseTaskSiblings = vi.fn();
vi.mock('@/features/tasks/hooks/useTaskSiblings', () => ({
  useTaskSiblings: (...args: unknown[]) => mockUseTaskSiblings(...args),
}));

vi.mock('@/features/tasks/hooks/useTaskComments', () => ({
  useTaskComments: () => ({ data: [], isLoading: false }),
  useCreateComment: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateComment: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteComment: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/tasks/hooks/useTaskCommentsRealtime', () => ({
  useTaskCommentsRealtime: () => undefined,
}));

vi.mock('@/shared/hooks/useActivityLog', () => ({
  useProjectActivity: () => ({ data: [], isLoading: false }),
  useTaskActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/shared/db/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

vi.mock('@/shared/api/auth', () => ({
  authApi: { checkIsAdmin: vi.fn().mockResolvedValue(false) },
}));

const mockRememberEmailAddress = vi.fn();
vi.mock('@/shared/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('@/shared/contexts/auth-context')>(
    '@/shared/contexts/auth-context',
  );
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', email: 'me@x.com', role: 'owner', subscription_status: 'active' },
      savedEmailAddresses: [],
      rememberEmailAddress: mockRememberEmailAddress,
    }),
  };
});

// Keep TaskResources/TaskDependencies lightweight for render tests.
vi.mock('@/features/tasks/components/TaskResources', () => ({
  default: () => <div data-testid="task-resources-stub" />,
}));
vi.mock('@/features/tasks/components/TaskDependencies', () => ({
  default: () => <div data-testid="task-dependencies-stub" />,
}));

import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';

function renderView(task: TaskItemData) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TaskDetailsView task={task} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TaskDetailsView — Related Tasks (Wave 21.5 §3.3)', () => {
  it('renders siblings in the order returned by the hook (position order)', () => {
    const parentId = 'parent-A';
    const rootId = 'root-1';
    const current = makeTask({
      id: 'task-2',
      title: 'Task 2',
      parent_task_id: parentId,
      root_id: rootId,
      position: 20000,
    }) as TaskItemData;
    const sibA = makeTask({
      id: 'task-1',
      title: 'Task 1',
      parent_task_id: parentId,
      position: 10000,
    }) as TaskRow;
    const sibC = makeTask({
      id: 'task-3',
      title: 'Task 3',
      parent_task_id: parentId,
      position: 30000,
    }) as TaskRow;

    mockUseTaskSiblings.mockReturnValue({ data: [sibA, sibC], isLoading: false });

    renderView(current);

    expect(mockUseTaskSiblings).toHaveBeenCalledWith('task-2', parentId);
    const section = screen.getByTestId('related-tasks-section');
    expect(section).toBeInTheDocument();

    // Siblings render in order; current is NOT present.
    const sibARow = screen.getByTestId('related-task-task-1');
    const sibCRow = screen.getByTestId('related-task-task-3');
    expect(sibARow).toHaveTextContent('Task 1');
    expect(sibCRow).toHaveTextContent('Task 3');
    expect(screen.queryByTestId('related-task-task-2')).toBeNull();

    // Hook already filters out the current task, so rendered DOM order
    // matches hook order.
    const rows = section.querySelectorAll('[data-testid^="related-task-"]');
    expect(rows[0]).toBe(sibARow);
    expect(rows[1]).toBe(sibCRow);
  });

  it('shows empty-state copy when the non-root task has no siblings', () => {
    const current = makeTask({
      id: 'only-child',
      title: 'Only Child',
      parent_task_id: 'parent-Z',
    }) as TaskItemData;

    mockUseTaskSiblings.mockReturnValue({ data: [], isLoading: false });

    renderView(current);

    expect(screen.getByTestId('related-tasks-section')).toBeInTheDocument();
    expect(screen.getByText(/no sibling tasks in this milestone\./i)).toBeInTheDocument();
  });

  it('does not render the Related Tasks section for root tasks (no parent)', () => {
    const root = makeTask({
      id: 'root-1',
      title: 'A project root',
      parent_task_id: null,
    }) as TaskItemData;

    mockUseTaskSiblings.mockReturnValue({ data: [], isLoading: false });

    renderView(root);

    expect(screen.queryByTestId('related-tasks-section')).toBeNull();
  });
});
