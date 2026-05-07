import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { makeTask } from '@test';
import ProjectHeader from '@/features/projects/components/ProjectHeader';

function renderHeader(project = makeTask({ id: 'project-1', title: 'Project One' }), tasks = [makeTask({ id: 'task-1', status: 'not_started' })]) {
    return render(
        <MemoryRouter>
            <ProjectHeader project={project} tasks={tasks} />
        </MemoryRouter>,
    );
}

describe('ProjectHeader derived project state', () => {
    it('shows derived task state instead of the root lifecycle status', () => {
        renderHeader(
            makeTask({ id: 'project-1', title: 'Project One', status: 'launched', is_complete: false }),
            [makeTask({ id: 'task-1', status: 'not_started' })],
        );

        expect(screen.getByTestId('project-derived-state-badge')).toHaveTextContent('Not started');
        expect(screen.queryByText(/launched/i)).toBeNull();
    });

    it('keeps archive visible as a visibility state', () => {
        renderHeader(
            makeTask({ id: 'project-1', title: 'Project One', status: 'archived', is_complete: false }),
            [makeTask({ id: 'task-1', status: 'in_progress' })],
        );

        expect(screen.getByTestId('project-derived-state-badge')).toHaveTextContent('Archived');
    });

    it('can derive state from full hierarchy while keeping leaf tasks separate', () => {
        render(
            <MemoryRouter>
                <ProjectHeader
                    project={makeTask({ id: 'project-1', title: 'Project One', status: 'launched', is_complete: false })}
                    tasks={[]}
                    stateTasks={[
                        makeTask({ id: 'project-1', status: 'launched' }),
                        makeTask({ id: 'phase-1', parent_task_id: 'project-1', status: 'not_started' }),
                    ]}
                />
            </MemoryRouter>,
        );

        expect(screen.getByTestId('project-derived-state-badge')).toHaveTextContent('Not started');
        expect(screen.queryByText('No tasks')).toBeNull();
    });

    it('routes the back control to tasks instead of dashboard', () => {
        const { container } = renderHeader();

        expect(container.querySelector('a[href="/tasks"]')).not.toBeNull();
        expect(container.querySelector('a[href="/dashboard"]')).toBeNull();
    });

    it('shows the invite action only when member management is allowed', () => {
        const { rerender } = render(
            <MemoryRouter>
                <ProjectHeader
                    project={makeTask({ id: 'project-1', title: 'Project One' })}
                    tasks={[]}
                    canInvite={false}
                    onInviteMember={() => undefined}
                />
            </MemoryRouter>,
        );

        expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();

        rerender(
            <MemoryRouter>
                <ProjectHeader
                    project={makeTask({ id: 'project-1', title: 'Project One' })}
                    tasks={[]}
                    canInvite
                    onInviteMember={() => undefined}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('button', { name: /invite/i })).toBeInTheDocument();
    });

    it('renders live project actions and metadata without dead-route controls', () => {
        const project = makeTask({
            id: 'project-1',
            title: 'Project One',
            due_date: '2026-07-04',
        });
        const tasks = [
            makeTask({ id: 'task-1', status: 'completed', is_complete: true }),
            makeTask({ id: 'task-2', status: 'not_started', is_complete: false }),
        ];

        const { container } = render(
            <MemoryRouter>
                <ProjectHeader
                    project={project}
                    tasks={tasks}
                    teamMembers={[
                        {
                            id: 'member-1',
                            project_id: 'project-1',
                            user_id: 'user-1',
                            role: 'owner',
                            joined_at: '2026-01-01T00:00:00Z',
                            email: 'owner@example.com',
                            first_name: 'Owner',
                            last_name: 'User',
                            display_name: 'Owner User',
                            avatar_url: null,
                        },
                    ]}
                    canManageSettings
                    canInvite
                    onInviteMember={() => undefined}
                />
            </MemoryRouter>,
        );

        expect(screen.getByRole('button', { name: /open command palette/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /open settings for project one/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /export project one as csv/i })).toBeInTheDocument();
        expect(container.querySelector('a[href="/reports?project=project-1"]')).not.toBeNull();
        expect(container.querySelector('a[href="/team?project=project-1"]')).not.toBeNull();
        expect(screen.getByRole('button', { name: /invite a member to project one/i })).toBeInTheDocument();
        expect(screen.getByText(/1 team member/i)).toBeInTheDocument();
        expect(screen.getByText(/50% complete/i)).toBeInTheDocument();
        expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    });
});
