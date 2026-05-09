import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Avoid the Supabase client bootstrap (no VITE_SUPABASE_* in the test env).
vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));

// Wave 33 + 36: TasksPage now calls useAuth() + useTeam() to resolve the
// caller's membership role for the delete guard. Stub both — neither is
// exercised by the tests below but their absence would throw at mount.
vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({
        user: { id: 'u1', email: 'me@example.com', role: 'owner' },
        savedEmailAddresses: [],
        rememberEmailAddress: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/people/hooks/useTeam', () => ({
    useTeam: () => ({ teamMembers: [], isLoading: false }),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// planterClient is the only data source TasksPage uses — return a fixed list.
vi.mock('@/shared/api/planterClient', () => {
    const taskList = [
        {
            id: 'p-alpha',
            title: 'Alpha Project',
            parent_task_id: null,
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            status: 'in_progress',
            task_type: 'project',
        },
        {
            id: 'phase-alpha',
            title: 'Launch Phase',
            parent_task_id: 'p-alpha',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            status: 'in_progress',
            task_type: 'phase',
        },
        {
            id: 'm-empty',
            title: 'Empty Milestone',
            parent_task_id: 'phase-alpha',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            status: 'todo',
            task_type: 'milestone',
            position: 1,
        },
        {
            id: 'm-launch',
            title: 'Launch Milestone',
            parent_task_id: 'phase-alpha',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            status: 'todo',
            task_type: 'milestone',
            position: 2,
        },
        {
            id: 't-1',
            title: 'Buy a domain',
            parent_task_id: 'm-launch',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            assignee_id: 'u1',
            status: 'in_progress',
            task_type: 'task',
            start_date: '2026-04-01',
            due_date: '2026-04-22',
            position: 1,
        },
        {
            id: 't-2',
            title: 'Write welcome letter',
            description: 'Draft the first-time guest follow-up copy',
            parent_task_id: 'm-launch',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u2',
            assignee_id: 'u1',
            status: 'in_progress',
            task_type: 'task',
            start_date: '2026-04-01',
            due_date: '2026-05-10',
            position: 2,
        },
        {
            id: 't-hidden',
            title: 'Future hidden task',
            parent_task_id: 'm-launch',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u2',
            assignee_id: 'u1',
            status: 'todo',
            task_type: 'task',
            start_date: '2099-01-01',
            due_date: '2099-01-08',
            position: 3,
        },
        {
            id: 't-1-child',
            title: 'Choose registrar',
            parent_task_id: 't-1',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            assignee_id: 'u1',
            status: 'todo',
            task_type: 'subtask',
            position: 1,
        },
    ];
    return {
        planter: {
            entities: {
                Task: {
                    list: vi.fn().mockResolvedValue(taskList),
                    update: vi.fn(),
                    updateStatus: vi.fn().mockImplementation((taskId: string, status: string) => {
                        const task = taskList.find((item) => item.id === taskId);
                        return Promise.resolve({
                            data: task ? { ...task, status } : null,
                            error: null,
                        });
                    }),
                    delete: vi.fn().mockResolvedValue(true),
                    updateParentDates: vi.fn(),
                },
            },
        },
    };
});

// Stub TaskDetailsPanel — the real panel mounts a full TaskDetailsView tree
// with realtime + presence hooks that aren't relevant to this test's concern
// (the wiring between TasksPage and the panel, not the panel's internals).
vi.mock('@/features/tasks/components/TaskDetailsPanel', () => ({
    default: ({
        selectedTask,
        allProjectTasks,
        onClose,
        onDeleteTaskWrapper,
    }: {
        selectedTask?: { id: string; title: string; children?: { id: string }[] };
        allProjectTasks?: { id: string }[];
        onClose: () => void;
        onDeleteTaskWrapper?: (taskId: string) => Promise<void>;
    }) => (
        <aside data-testid="tasks-page-details-panel">
            <div data-testid="tasks-page-details-panel-title">{selectedTask?.title}</div>
            <div data-testid="tasks-page-details-panel-child-count">{selectedTask?.children?.length ?? 0}</div>
            <div data-testid="tasks-page-details-panel-project-task-count">{allProjectTasks?.length ?? 0}</div>
            <button onClick={onClose} data-testid="tasks-page-details-panel-close">Close</button>
            {selectedTask && onDeleteTaskWrapper ? (
                <button
                    onClick={() => { void onDeleteTaskWrapper(selectedTask.id); }}
                    data-testid="tasks-page-details-panel-delete"
                >
                    Delete from panel
                </button>
            ) : null}
        </aside>
    ),
}));

// Board view is lazy content — stubbing removes dnd-kit spin-up for tests.
vi.mock('@/features/tasks/components/board/ProjectBoardView', () => ({
    default: () => null,
}));

import { renderWithProviders } from '@test/render-with-providers';
import TasksPage from '@/pages/TasksPage';
import { planter } from '@/shared/api/planterClient';

function renderTasksPage() {
    return renderWithProviders(
        <MemoryRouter initialEntries={['/tasks']}>
            <TasksPage />
        </MemoryRouter>,
    );
}

describe('TasksPage — global tasks view + details dialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        if (!HTMLElement.prototype.hasPointerCapture) {
            HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
        }
        if (!HTMLElement.prototype.setPointerCapture) {
            HTMLElement.prototype.setPointerCapture = vi.fn();
        }
        if (!HTMLElement.prototype.releasePointerCapture) {
            HTMLElement.prototype.releasePointerCapture = vi.fn();
        }
        if (!HTMLElement.prototype.scrollIntoView) {
            HTMLElement.prototype.scrollIntoView = vi.fn();
        }
    });

    it('does not render the details panel until a task is clicked', async () => {
        renderTasksPage();
        await screen.findByText('Buy a domain');
        expect(screen.queryByTestId('tasks-page-details-panel')).not.toBeInTheDocument();
    });

    it('defaults to all actionable work and excludes root project rows', async () => {
        renderTasksPage();

        expect(await screen.findByRole('heading', { name: 'All Tasks' })).toBeInTheDocument();
        expect(screen.getByText('Showing 7 of 7 work items')).toBeInTheDocument();
        expect(screen.getByText('Empty Milestone')).toBeInTheDocument();
        expect(screen.getByText('Future hidden task')).toBeInTheDocument();
        expect(screen.getByLabelText('Sort order')).toBeInTheDocument();
        expect(screen.queryByTestId('task-row-p-alpha')).not.toBeInTheDocument();
    });

    it('shows first-run project creation choices when no projects or tasks are visible', async () => {
        vi.mocked(planter.entities.Task.list).mockResolvedValueOnce([]);

        renderTasksPage();

        expect(await screen.findByRole('heading', { name: 'Start your first project' })).toBeInTheDocument();
        expect(screen.getByText('Create a blank project or use the Launch Large template to add your first project workspace.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /start blank project/i })).toHaveAttribute('href', '/tasks?action=new-project');
        expect(screen.getByRole('link', { name: /use launch large template/i })).toHaveAttribute(
            'href',
            '/tasks?action=new-project&template=launch_large',
        );
    });

    it('keeps the normal empty task copy when a project exists without visible work items', async () => {
        vi.mocked(planter.entities.Task.list).mockResolvedValueOnce([
            {
                id: 'p-empty',
                title: 'Empty Project',
                parent_task_id: null,
                root_id: 'p-empty',
                origin: 'instance',
                creator: 'u1',
                status: 'in_progress',
                task_type: 'project',
            },
        ]);

        renderTasksPage();

        expect(await screen.findByText('No tasks in any of your projects.')).toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Start your first project' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /start blank project/i })).not.toBeInTheDocument();
    });

    it('keeps priority available as an explicit quick filter', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await screen.findByRole('heading', { name: 'All Tasks' });

        await user.click(screen.getByRole('combobox', { name: 'Task view' }));
        await user.click(await screen.findByRole('option', { name: 'Priority' }));

        expect(await screen.findByRole('heading', { name: 'Priority' })).toBeInTheDocument();
        expect(screen.getByTestId('priority-task-group-milestone-m-launch')).toBeInTheDocument();
        expect(screen.getByText('Launch Milestone')).toBeInTheDocument();
        expect(screen.queryByText('Empty Milestone')).not.toBeInTheDocument();
        expect(screen.queryByText('Future hidden task')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Sort order')).not.toBeInTheDocument();
    });

    it('searches title, description, and project context inside the RLS-visible task list', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await screen.findByText('Buy a domain');
        const search = screen.getByRole('searchbox', { name: 'Search tasks and projects' });

        await user.type(search, 'guest follow-up');
        expect(await screen.findByText('Write welcome letter')).toBeInTheDocument();
        expect(screen.queryByText('Buy a domain')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Clear task search' }));
        await user.type(search, 'Alpha Project');
        expect(await screen.findByText('Buy a domain')).toBeInTheDocument();
        expect(screen.getByText('Future hidden task')).toBeInTheDocument();

        await user.clear(search);
        await user.type(search, 'does-not-exist');
        expect(await screen.findByText('No tasks match your search and filters.')).toBeInTheDocument();
    });

    it('opens the details dialog with the clicked task', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        const row = await screen.findByTestId('task-row-t-1');
        await user.click(row);

        expect(await screen.findByRole('dialog', { name: 'Buy a domain' })).toBeInTheDocument();
        const panel = await screen.findByTestId('tasks-page-details-panel');
        expect(panel).toBeInTheDocument();
        expect(screen.getByTestId('tasks-page-details-panel-title')).toHaveTextContent('Buy a domain');
    });

    it('does not expose no-op row action controls on the unified tasks list', async () => {
        renderTasksPage();

        await screen.findByTestId('task-row-t-1');

        expect(screen.queryByRole('button', { name: /edit buy a domain/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /add subtask under buy a domain/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /invite member to buy a domain/i })).not.toBeInTheDocument();
    });

    it('opens the details dialog from the keyboard', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        const row = await screen.findByTestId('task-row-t-1');
        row.focus();
        await user.keyboard('{Enter}');

        expect(await screen.findByRole('dialog', { name: 'Buy a domain' })).toBeInTheDocument();
    });

    it('hydrates the clicked task with project context for the details panel', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await user.click(await screen.findByTestId('task-row-t-1'));

        expect(await screen.findByTestId('tasks-page-details-panel-child-count')).toHaveTextContent('1');
        expect(screen.getByTestId('tasks-page-details-panel-project-task-count')).toHaveTextContent('8');
    });

    it('routes status-only row changes through updateStatus after the open-subtask confirmation', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        const statusSelect = await screen.findByRole('combobox', { name: 'Status for Buy a domain' });
        fireEvent.change(statusSelect, { target: { value: 'completed' } });

        const dialog = await screen.findByRole('dialog', { name: 'Complete task with open subtasks?' });
        await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

        await waitFor(() => {
            expect(planter.entities.Task.updateStatus).toHaveBeenCalledWith('t-1', 'completed');
        });
        expect(planter.entities.Task.update).not.toHaveBeenCalledWith('t-1', { status: 'completed' });
    });

    it('closes the details panel via onClose', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await user.click(await screen.findByTestId('task-row-t-1'));
        await screen.findByTestId('tasks-page-details-panel');

        await user.click(screen.getByTestId('tasks-page-details-panel-close'));

        await waitFor(() => {
            expect(screen.queryByTestId('tasks-page-details-panel')).not.toBeInTheDocument();
        });
    });

    it('wires the details panel delete action through the task delete mutation', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await user.click(await screen.findByTestId('task-row-t-1'));
        await user.click(await screen.findByTestId('tasks-page-details-panel-delete'));
        await user.click(await screen.findByRole('button', { name: 'Delete' }));

        await waitFor(() => {
            expect(planter.entities.Task.delete).toHaveBeenCalledWith('t-1');
        });
        await waitFor(() => {
            expect(screen.queryByTestId('tasks-page-details-panel')).not.toBeInTheDocument();
        });
    });

    it('reveals the parent project name on title hover', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        const title = await screen.findByTestId('task-row-title-t-1');
        await user.hover(title);

        await waitFor(() => {
            expect(screen.getAllByText('Alpha Project').length).toBeGreaterThan(0);
        });
    });

    it('applies the due-date range filter via the inline date inputs', async () => {
        renderTasksPage();

        await screen.findByText('Buy a domain');
        await screen.findByText('Write welcome letter');

        const start = screen.getByTestId('tasks-due-range-start') as HTMLInputElement;
        const end = screen.getByTestId('tasks-due-range-end') as HTMLInputElement;

        fireEvent.change(start, { target: { value: '2026-04-01' } });
        fireEvent.change(end, { target: { value: '2026-04-30' } });

        await waitFor(() => {
            expect(screen.queryByText('Write welcome letter')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Buy a domain')).toBeInTheDocument();

        // Clearing restores the original list.
        const clear = screen.getByTestId('tasks-due-range-clear');
        fireEvent.click(clear);

        await waitFor(() => {
            expect(screen.getByText('Write welcome letter')).toBeInTheDocument();
        });
    });
});
