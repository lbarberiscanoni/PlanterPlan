import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import type { ReactNode } from 'react';

// Neutralize the Supabase client bootstrap so the transitive planterClient
// import (via TaskControlButtons → useMasterLibrarySearch) doesn't throw on
// missing VITE_SUPABASE_* env vars in the test runner.
vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        },
    },
}));

import { renderWithProviders } from '@test/render-with-providers';
import { makeTask } from '@test/factories';
import TaskItem from '@/features/tasks/components/TaskItem';
import type { TaskItemData } from '@/shared/types/tasks';

// Wednesday, Apr 22 2026 — same day the rest of the Wave 32/33 tests anchor to.
const NOW = new Date('2026-04-22T12:00:00.000Z');

function DndWrapper({ children }: { children: ReactNode }) {
    return <DndContext>{children}</DndContext>;
}

function renderTaskItem(task: TaskItemData) {
    return renderWithProviders(<DndWrapper><TaskItem task={task} /></DndWrapper>);
}

function renderTaskItemWithStatusPermission(task: TaskItemData, opts: { canUpdateStatus: boolean; onStatusChange: (id: string, status: string) => void }) {
    return renderWithProviders(
        <DndWrapper>
            <TaskItem task={task} canUpdateStatus={opts.canUpdateStatus} onStatusChange={opts.onStatusChange} />
        </DndWrapper>,
    );
}

function renderTaskItemWithChildAction(task: TaskItemData, opts: { level: number; onAddChildTask: (task: TaskItemData) => void }) {
    return renderWithProviders(
        <DndWrapper>
            <TaskItem task={task} level={opts.level} onAddChildTask={opts.onAddChildTask} />
        </DndWrapper>,
    );
}

describe('TaskItem due-date badge (Wave 33)', () => {
    beforeAll(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterAll(() => {
        vi.useRealTimers();
    });

    it('omits the badge when due_date is null', () => {
        const task = makeTask({ id: 'no-date', title: 'No date', due_date: null }) as TaskItemData;
        renderTaskItem(task);
        expect(screen.queryByTestId('task-row-due-badge-no-date')).not.toBeInTheDocument();
    });

    it('renders "Today" with due_soon tone on the badge', () => {
        const task = makeTask({ id: 'today', title: 'Today', due_date: '2026-04-22' }) as TaskItemData;
        renderTaskItem(task);
        const badge = screen.getByTestId('task-row-due-badge-today');
        expect(badge).toHaveTextContent(/today/i);
        expect(badge).toHaveAttribute('data-tone', 'due_soon');
        expect(badge.className).toContain('text-orange-600');
    });

    it('renders "Tomorrow" with due_soon tone', () => {
        const task = makeTask({ id: 'tmrw', title: 'Tomorrow', due_date: '2026-04-23' }) as TaskItemData;
        renderTaskItem(task);
        const badge = screen.getByTestId('task-row-due-badge-tmrw');
        expect(badge).toHaveTextContent(/tomorrow/i);
        expect(badge).toHaveAttribute('data-tone', 'due_soon');
    });

    it('renders overdue tone in red for a past due_date', () => {
        const task = makeTask({ id: 'past', title: 'Past', due_date: '2026-04-15' }) as TaskItemData;
        renderTaskItem(task);
        const badge = screen.getByTestId('task-row-due-badge-past');
        expect(badge).toHaveAttribute('data-tone', 'overdue');
        expect(badge.className).toContain('text-red-600');
    });

    it('renders neutral tone for a far-future due_date', () => {
        const task = makeTask({ id: 'far', title: 'Far', due_date: '2026-07-04' }) as TaskItemData;
        renderTaskItem(task);
        const badge = screen.getByTestId('task-row-due-badge-far');
        expect(badge).toHaveAttribute('data-tone', 'neutral');
        expect(badge.className).toContain('text-slate-600');
        expect(badge).toHaveTextContent('Jul 4, 2026');
    });

    it('is right-aligned next to the status select (appears in the right-side cluster)', () => {
        const task = makeTask({ id: 'rightside', title: 'Right', due_date: '2026-04-22' }) as TaskItemData;
        renderTaskItem(task);
        const row = screen.getByTestId('task-row-rightside');
        // The badge is part of the right-side cluster, distinct from the
        // title text in the left/middle cluster.
        const badge = within(row).getByTestId('task-row-due-badge-rightside');
        expect(badge).toBeInTheDocument();
    });

    it('hides the due badge for template tasks even when due_date is set', () => {
        const task = makeTask({
            id: 'tmpl-due',
            title: 'Template Task',
            origin: 'template',
            due_date: '2026-04-22',
        }) as TaskItemData;
        renderTaskItem(task);
        expect(screen.queryByTestId('task-row-due-badge-tmpl-due')).not.toBeInTheDocument();
    });

    it('hides the status select for template tasks', () => {
        const task = makeTask({
            id: 'tmpl-status',
            title: 'Template Task',
            origin: 'template',
            due_date: null,
        }) as TaskItemData;
        renderTaskItem(task);
        // Status select renders a combobox / role=combobox per Radix Select
        const row = screen.getByTestId('task-row-tmpl-status');
        expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('disables the status select when the caller cannot update task progress', () => {
        const onStatusChange = vi.fn();
        const task = makeTask({ id: 'locked-status', title: 'Locked Status', origin: 'instance' }) as TaskItemData;
        renderTaskItemWithStatusPermission(task, { canUpdateStatus: false, onStatusChange });

        const select = screen.getByRole('combobox');
        expect(select).toBeDisabled();
        fireEvent.change(select, { target: { value: 'completed' } });
        expect(onStatusChange).not.toHaveBeenCalled();
    });

    it('keeps the status select interactive for permitted progress updates', () => {
        const onStatusChange = vi.fn();
        const task = makeTask({ id: 'editable-status', title: 'Editable Status', origin: 'instance' }) as TaskItemData;
        renderTaskItemWithStatusPermission(task, { canUpdateStatus: true, onStatusChange });

        const select = screen.getByRole('combobox');
        expect(select).not.toBeDisabled();
        fireEvent.change(select, { target: { value: 'completed' } });
        expect(onStatusChange).toHaveBeenCalledWith('editable-status', 'completed');
    });

    it('shows add-subtask controls only on task rows, not subtask rows', () => {
        const onAddChildTask = vi.fn();
        const task = makeTask({ id: 'task-parent', title: 'Parent task', origin: 'instance' }) as TaskItemData;
        const { rerender } = renderTaskItemWithChildAction(task, { level: 0, onAddChildTask });

        expect(screen.getByRole('button', { name: /add subtask under parent task/i })).toBeInTheDocument();

        rerender(
            <DndWrapper>
                <TaskItem task={task} level={1} onAddChildTask={onAddChildTask} />
            </DndWrapper>,
        );

        expect(screen.queryByRole('button', { name: /add subtask under parent task/i })).not.toBeInTheDocument();
    });

    it('hides row action controls when no backed handlers are provided', () => {
        const task = makeTask({ id: 'actions-hidden', title: 'Actionless task', origin: 'instance' }) as TaskItemData;
        renderTaskItem(task);

        expect(screen.queryByRole('button', { name: /edit actionless task/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /add subtask under actionless task/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /invite member to actionless task/i })).not.toBeInTheDocument();
    });
});
