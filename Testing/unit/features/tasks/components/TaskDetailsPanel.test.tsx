import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeTask } from '@test';
import type { TaskItemData } from '@/features/tasks/components/TaskItem';

const mockTaskDetailsView = vi.fn();

vi.mock('@/features/tasks/components/TaskForm', () => ({
    default: () => <div data-testid="task-form-stub" />,
}));

vi.mock('@/features/tasks/components/TaskDetailsView', () => ({
    default: (props: Record<string, unknown>) => {
        mockTaskDetailsView(props);
        return <div data-testid="task-details-view-stub" />;
    },
}));

import TaskDetailsPanel from '@/features/tasks/components/TaskDetailsPanel';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('TaskDetailsPanel', () => {
    it('passes membershipRole through to TaskDetailsView', () => {
        const task = makeTask({ id: 't1', title: 'Template task' });

        render(
            <TaskDetailsPanel
                showForm={false}
                selectedTask={task}
                membershipRole="owner"
                onClose={vi.fn()}
                onDeleteTaskWrapper={vi.fn()}
            />,
        );

        expect(screen.getByTestId('task-details-view-stub')).toBeInTheDocument();
        expect(mockTaskDetailsView).toHaveBeenCalledWith(expect.objectContaining({
            membershipRole: 'owner',
        }));
    });

    it('passes edit capability through to TaskDetailsView', () => {
        const task = makeTask({ id: 't1', title: 'Coach-visible task' });

        render(
            <TaskDetailsPanel
                showForm={false}
                selectedTask={task}
                canEdit={false}
                onClose={vi.fn()}
                onDeleteTaskWrapper={vi.fn()}
            />,
        );

        expect(mockTaskDetailsView).toHaveBeenCalledWith(expect.objectContaining({
            canEdit: false,
        }));
    });

    it('passes the project-context comments visibility flag through to TaskDetailsView', () => {
        const task = makeTask({ id: 't1', title: 'Project task' });

        render(
            <TaskDetailsPanel
                showForm={false}
                selectedTask={task}
                showComments={false}
                onClose={vi.fn()}
            />,
        );

        expect(screen.getByTestId('task-details-view-stub')).toBeInTheDocument();
        expect(mockTaskDetailsView).toHaveBeenCalledWith(expect.objectContaining({
            showComments: false,
        }));
    });

    it('does not pass a delete handler when no delete wrapper exists', () => {
        const task = makeTask({ id: 't1', title: 'Plain task' });

        render(
            <TaskDetailsPanel
                showForm={false}
                selectedTask={task}
                onClose={vi.fn()}
            />,
        );

        const props = mockTaskDetailsView.mock.calls[0]?.[0] as { onDeleteTask?: (task: TaskItemData) => void };
        expect(props.onDeleteTask).toBeUndefined();
    });
});
