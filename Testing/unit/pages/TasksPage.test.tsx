import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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
vi.mock('@/shared/contexts/AuthContext', () => ({
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
            id: 't-1',
            title: 'Buy a domain',
            parent_task_id: 'p-alpha',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u1',
            assignee_id: 'u1',
            status: 'in_progress',
            task_type: 'task',
            due_date: '2026-04-22',
        },
        {
            id: 't-2',
            title: 'Write welcome letter',
            parent_task_id: 'p-alpha',
            root_id: 'p-alpha',
            origin: 'instance',
            creator: 'u2',
            assignee_id: 'u1',
            status: 'in_progress',
            task_type: 'task',
            due_date: '2026-05-10',
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

describe('TasksPage — click-to-details + tooltip wiring (Wave 33)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does not render the details panel until a task is clicked', async () => {
        renderTasksPage();
        await screen.findByText('Buy a domain');
        expect(screen.queryByTestId('tasks-page-details-panel')).not.toBeInTheDocument();
    });

    it('opens the details panel with the clicked task', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        const row = await screen.findByTestId('task-row-t-1');
        await user.click(row);

        const panel = await screen.findByTestId('tasks-page-details-panel');
        expect(panel).toBeInTheDocument();
        expect(screen.getByTestId('tasks-page-details-panel-title')).toHaveTextContent('Buy a domain');
    });

    it('hydrates the clicked task with project context for the details panel', async () => {
        const user = userEvent.setup();
        renderTasksPage();

        await user.click(await screen.findByTestId('task-row-t-1'));

        expect(await screen.findByTestId('tasks-page-details-panel-child-count')).toHaveTextContent('1');
        expect(screen.getByTestId('tasks-page-details-panel-project-task-count')).toHaveTextContent('4');
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
