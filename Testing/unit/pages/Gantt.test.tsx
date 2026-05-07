import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { mockGanttLib } from '@test/mocks/gantt';

vi.mock('gantt-task-react', () => mockGanttLib());
vi.mock('gantt-task-react/dist/index.css', () => ({}));

const activeProjects: Array<{ id: string; title: string }> = [];
const projectHierarchy: unknown[] = [];

vi.mock('@/features/projects/hooks/useProjectList', () => ({
    useProjectList: () => ({
        state: {},
        data: { activeProjects },
        actions: {},
    }),
}));

vi.mock('@/features/projects/hooks/useProjectData', () => ({
    useProjectData: () => ({ project: undefined, loadingProject: false, projectHierarchy, phases: [], milestones: [], tasks: [], teamMembers: [] }),
}));

vi.mock('@/features/tasks/hooks/useTaskMutations', () => ({
    useUpdateTask: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock('@/features/gantt/hooks/useGanttDragShift', () => ({
    useGanttDragShift: () => vi.fn(),
}));

import Gantt from '@/pages/Gantt';

function wrap(route: string) {
    function Wrapper({ children }: { children: ReactNode }) {
        const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        return (
            <QueryClientProvider client={qc}>
                <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </QueryClientProvider>
        );
    }
    return Wrapper;
}

describe('Gantt page (Wave 28)', () => {
    beforeEach(() => {
        activeProjects.length = 0;
        projectHierarchy.length = 0;
    });

    it('renders the empty state with a project picker when no projectId is in the URL', () => {
        activeProjects.push({ id: 'p1', title: 'Alpha' });
        const Wrapper = wrap('/gantt');
        render(
            <Wrapper>
                <Gantt />
            </Wrapper>,
        );

        expect(screen.getByRole('heading', { name: 'Gantt Chart' })).toBeInTheDocument();
        expect(screen.getByLabelText(/project/i)).toBeInTheDocument();
    });

    it('tells the user when there are no active projects', () => {
        const Wrapper = wrap('/gantt');
        render(
            <Wrapper>
                <Gantt />
            </Wrapper>,
        );
        expect(screen.getByText(/no active projects yet/i)).toBeInTheDocument();
    });

    it('mounts ProjectGantt when projectId is present in the URL', () => {
        const Wrapper = wrap('/gantt?projectId=p1');
        render(
            <Wrapper>
                <Gantt />
            </Wrapper>,
        );

        expect(screen.getByTestId('project-gantt')).toBeInTheDocument();
    });
});
