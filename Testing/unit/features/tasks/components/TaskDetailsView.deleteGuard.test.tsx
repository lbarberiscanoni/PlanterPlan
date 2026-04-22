import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskItemData } from '@/shared/types/tasks';

// Same mock envelope as the coaching-badge suite — TaskDetailsView pulls a
// long dependency chain through useTaskSiblings / useTaskComments / the
// activity hooks / the Supabase client. We only care about the delete button
// + guard dialog here.

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
vi.mock('@/features/projects/hooks/useProjectActivity', () => ({
    useProjectActivity: () => ({ data: [], isLoading: false }),
    useTaskActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));
vi.mock('@/shared/api/auth', () => ({
    authApi: { checkIsAdmin: vi.fn().mockResolvedValue(false) },
}));
vi.mock('@/shared/contexts/AuthContext', async () => {
    const actual = await vi.importActual<typeof import('@/shared/contexts/AuthContext')>(
        '@/shared/contexts/AuthContext',
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
vi.mock('@/features/people/hooks/useTeam', () => ({
    useTeam: () => ({ teamMembers: [] }),
}));

import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';

function renderView(task: TaskItemData, opts: { membershipRole?: string; onDeleteTask?: (t: TaskItemData) => void }) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <TaskDetailsView
                task={task}
                membershipRole={opts.membershipRole}
                onDeleteTask={opts.onDeleteTask}
            />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUseTaskSiblings.mockReturnValue([]);
});

type TemplateTaskOverrides = Partial<TaskItemData> & { cloned_from_task_id?: string | null };

function makeTemplateOriginTask(overrides: TemplateTaskOverrides = {}): TaskItemData {
    return makeTask({
        id: 't1',
        title: 'Task cloned from template',
        origin: 'instance',
        ...overrides,
    } as Partial<TaskItemData>) as unknown as TaskItemData;
}

describe('TaskDetailsView — template-origin delete guard (Wave 36 Task 2)', () => {
    it('opens the guard dialog for a non-owner trying to delete a template-origin task', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: 'tpl-source-1' });
        renderView(task, { membershipRole: 'editor', onDeleteTask: onDelete });

        const deleteBtn = screen.getByTestId('delete-task-btn');
        await userEvent.setup().click(deleteBtn);

        expect(screen.getByTestId('template-origin-delete-guard')).toBeInTheDocument();
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('owner bypasses the guard and the delete handler fires directly', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: 'tpl-source-1' });
        renderView(task, { membershipRole: 'owner', onDeleteTask: onDelete });

        await userEvent.setup().click(screen.getByTestId('delete-task-btn'));

        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('template-origin-delete-guard')).not.toBeInTheDocument();
    });

    it('does not show the guard for post-instantiation custom tasks (cloned_from_task_id is null)', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: null });
        renderView(task, { membershipRole: 'editor', onDeleteTask: onDelete });

        await userEvent.setup().click(screen.getByTestId('delete-task-btn'));

        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('template-origin-delete-guard')).not.toBeInTheDocument();
    });
});
