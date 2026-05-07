import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskItemData } from '@/shared/types/tasks';

// Mocks must be declared before the import of the component under test.
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

vi.mock('@/shared/contexts/auth-context', async () => {
  const actual = await vi.importActual<typeof import('@/shared/contexts/auth-context')>(
    '@/shared/contexts/auth-context',
  );
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'u1', email: 'me@x.com', role: 'owner' },
      savedEmailAddresses: [],
      rememberEmailAddress: vi.fn(),
    }),
  };
});

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
  mockUseTaskSiblings.mockReturnValue([]);
});

describe('TaskDetailsView — Coaching badge (Wave 22)', () => {
  it('renders the Coaching badge when settings.is_coaching_task === true', () => {
    const task = makeTask({
      id: 't1',
      title: 'Coached task',
      origin: 'instance',
      settings: { is_coaching_task: true },
    }) as unknown as TaskItemData;
    renderView(task);
    expect(screen.getByTestId('coaching-badge')).toBeInTheDocument();
    expect(screen.getByTestId('coaching-badge')).toHaveTextContent(/coaching/i);
  });

  it('does not render the badge when settings.is_coaching_task is false', () => {
    const task = makeTask({
      id: 't1',
      title: 'Plain task',
      origin: 'instance',
      settings: { is_coaching_task: false },
    }) as unknown as TaskItemData;
    renderView(task);
    expect(screen.queryByTestId('coaching-badge')).toBeNull();
  });

  it('does not render the badge when the key is absent', () => {
    const task = makeTask({
      id: 't1',
      title: 'Plain task',
      origin: 'instance',
      settings: { due_soon_threshold: 5 },
    }) as unknown as TaskItemData;
    renderView(task);
    expect(screen.queryByTestId('coaching-badge')).toBeNull();
  });

  it('does not render the badge when settings is null', () => {
    const task = makeTask({
      id: 't1',
      title: 'Plain task',
      origin: 'instance',
      settings: null,
    }) as unknown as TaskItemData;
    renderView(task);
    expect(screen.queryByTestId('coaching-badge')).toBeNull();
  });
});
