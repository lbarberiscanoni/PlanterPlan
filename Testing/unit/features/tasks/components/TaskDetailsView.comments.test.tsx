import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { makeTask } from '@test';
import type { TaskItemData } from '@/features/tasks/components/TaskItem';

const mockUseTaskSiblings = vi.fn();

vi.mock('@/features/tasks/hooks/useTaskSiblings', () => ({
    useTaskSiblings: (...args: unknown[]) => mockUseTaskSiblings(...args),
}));

vi.mock('@/features/tasks/components/TaskComments/TaskComments', () => ({
    default: ({ taskId }: { taskId: string }) => (
        <div data-testid="task-comments-stub" data-task-id={taskId} />
    ),
}));

vi.mock('@/shared/hooks/useActivityLog', () => ({
    useTaskActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/shared/contexts/auth-context', async () => {
    const actual = await vi.importActual<typeof import('@/shared/contexts/auth-context')>(
        '@/shared/contexts/auth-context',
    );
    return {
        ...actual,
        useAuth: () => ({
            user: { id: 'u1', email: 'owner@example.com', role: 'owner' },
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

vi.mock('@/features/tasks/components/StrategyFollowUpDialog', () => ({
    default: () => <div data-testid="strategy-follow-up-stub" />,
}));

import TaskDetailsView from '@/features/tasks/components/TaskDetailsView';

const task = makeTask({
    id: 'task-1',
    title: 'Project task',
    origin: 'instance',
}) as TaskItemData;

beforeEach(() => {
    vi.clearAllMocks();
    mockUseTaskSiblings.mockReturnValue({ data: [] });
});

describe('TaskDetailsView comments visibility', () => {
    it('renders task comments by default for non-project-context callers', () => {
        render(<TaskDetailsView task={task} />);

        expect(screen.getByTestId('task-comments-stub')).toHaveAttribute('data-task-id', 'task-1');
    });

    it('omits task comments when project context disables them', () => {
        render(<TaskDetailsView task={task} showComments={false} />);

        expect(screen.queryByTestId('task-comments-stub')).not.toBeInTheDocument();
        expect(screen.getByTestId('task-activity-rail')).toBeInTheDocument();
    });
});
