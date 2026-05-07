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
vi.mock('@/shared/hooks/useActivityLog', () => ({
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
vi.mock('@/features/people/hooks/useTeam', () => ({
    useTeam: () => ({ teamMembers: [] }),
}));

import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';

function renderView(task: TaskItemData, opts: {
    allProjectTasks?: TaskItemData[];
    canEdit?: boolean;
    membershipRole?: string;
    onAddChildTask?: (t: TaskItemData) => void;
    onDeleteTask?: (t: TaskItemData) => void;
}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={queryClient}>
            <TaskDetailsView
                task={task}
                allProjectTasks={opts.allProjectTasks}
                canEdit={opts.canEdit}
                membershipRole={opts.membershipRole}
                onAddChildTask={opts.onAddChildTask}
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

describe('TaskDetailsView — template-origin delete guard', () => {
    it('opens the guard dialog for an editor trying to delete a template-origin task', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: 'tpl-source-1' });
        renderView(task, { membershipRole: 'editor', onDeleteTask: onDelete });

        const deleteBtn = screen.getByTestId('delete-task-btn');
        await userEvent.setup().click(deleteBtn);

        expect(screen.getByTestId('template-origin-delete-guard')).toBeInTheDocument();
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('opens the guard dialog for an owner trying to delete a template-origin task', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: 'tpl-source-1' });
        renderView(task, { membershipRole: 'owner', onDeleteTask: onDelete });

        await userEvent.setup().click(screen.getByTestId('delete-task-btn'));

        expect(screen.getByTestId('template-origin-delete-guard')).toBeInTheDocument();
        expect(screen.getByText(/cannot be deleted from project workspaces/i)).toBeInTheDocument();
        expect(onDelete).not.toHaveBeenCalled();
    });

    it('does not show the guard for post-instantiation custom tasks (cloned_from_task_id is null)', async () => {
        const onDelete = vi.fn();
        const task = makeTemplateOriginTask({ cloned_from_task_id: null });
        renderView(task, { membershipRole: 'editor', onDeleteTask: onDelete });

        await userEvent.setup().click(screen.getByTestId('delete-task-btn'));

        expect(onDelete).toHaveBeenCalledTimes(1);
        expect(screen.queryByTestId('template-origin-delete-guard')).not.toBeInTheDocument();
    });

    it('shows Add Child Task for task-depth rows', () => {
        const onAddChildTask = vi.fn();
        const project = makeTask({ id: 'project', parent_task_id: null, task_type: 'project' }) as unknown as TaskItemData;
        const phase = makeTask({ id: 'phase', parent_task_id: 'project', task_type: 'phase' }) as unknown as TaskItemData;
        const milestone = makeTask({ id: 'milestone', parent_task_id: 'phase', task_type: 'milestone' }) as unknown as TaskItemData;
        const task = makeTemplateOriginTask({
            id: 'task-depth-row',
            parent_task_id: 'milestone',
            task_type: 'task',
        });

        renderView(task, {
            allProjectTasks: [project, phase, milestone, task],
            canEdit: true,
            onAddChildTask,
        });

        expect(screen.getByRole('button', { name: /\+ add child task/i })).toBeInTheDocument();
    });

    it('hides Add Child Task for final-level subtasks', () => {
        const onAddChildTask = vi.fn();
        const project = makeTask({ id: 'project', parent_task_id: null, task_type: 'project' }) as unknown as TaskItemData;
        const phase = makeTask({ id: 'phase', parent_task_id: 'project', task_type: 'phase' }) as unknown as TaskItemData;
        const milestone = makeTask({ id: 'milestone', parent_task_id: 'phase', task_type: 'milestone' }) as unknown as TaskItemData;
        const parentTask = makeTask({ id: 'parent-task', parent_task_id: 'milestone', task_type: 'task' }) as unknown as TaskItemData;
        const subtask = makeTemplateOriginTask({
            id: 'subtask-row',
            parent_task_id: 'parent-task',
            task_type: 'subtask',
        });

        renderView(subtask, {
            allProjectTasks: [project, phase, milestone, parentTask, subtask],
            canEdit: true,
            onAddChildTask,
        });

        expect(screen.queryByRole('button', { name: /\+ add child task/i })).not.toBeInTheDocument();
    });
});
