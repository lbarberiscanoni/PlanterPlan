import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

// Dashboard mounts a lot of downstream widgets. Replace the heavy ones with
// no-op stubs so the test is focused on the header button wiring.
vi.mock('@/features/projects/hooks/useProjectRealtime', () => ({
    useProjectRealtime: () => undefined,
}));
vi.mock('@/features/projects/hooks/useProjectMutations', () => ({
    useCreateProject: () => ({ mutateAsync: vi.fn() }),
    useUpdateProjectStatus: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            Task: { create: vi.fn() },
            TeamMember: { create: vi.fn() },
        },
    },
}));
vi.mock('@/features/dashboard/components/StatsOverview', () => ({
    default: () => null,
}));
vi.mock('@/features/dashboard/components/ProjectPipelineBoard', () => ({
    default: () => null,
}));
vi.mock('@/features/dashboard/components/CreateProjectModal', () => ({
    default: () => null,
}));
vi.mock('@/features/dashboard/components/CreateTemplateModal', () => ({
    default: () => null,
}));
vi.mock('@/features/mobile/MobileAgenda', () => ({
    default: () => null,
}));
vi.mock('@/pages/components/OnboardingWizard', () => ({
    default: () => null,
}));

const setShowTemplateModal = vi.fn();
const setShowCreateModal = vi.fn();
const handleDismissWizard = vi.fn();

const dashboardState = {
    isLoading: false,
    isError: false,
    error: null,
    user: { id: 'u1', email: 'u1@example.com' },
    showCreateModal: false,
    showTemplateModal: false,
    wizardDismissed: true,
    searchQuery: '',
    selectedProjectId: null,
};

const dashboardData = {
    projects: [{ id: 'p1', title: 'Alpha project' }],
    activeProjects: [],
    archivedProjects: [],
    allTasks: [],
    filteredTasks: [],
    teamMembers: [],
};

vi.mock('@/features/dashboard/hooks/useDashboard', () => ({
    useDashboard: () => ({
        state: dashboardState,
        data: dashboardData,
        actions: {
            setShowCreateModal,
            setShowTemplateModal,
            setSearchQuery: vi.fn(),
            setSelectedProjectId: vi.fn(),
            handleDismissWizard,
        },
    }),
}));

import Dashboard from '@/pages/Dashboard';

function renderDashboard() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={qc}>
                <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>
            </QueryClientProvider>
        );
    }
    return render(<Dashboard />, { wrapper: Wrapper });
}

describe('Dashboard header (Wave 32)', () => {
    beforeEach(() => {
        setShowTemplateModal.mockReset();
        setShowCreateModal.mockReset();
    });

    it('renders both "New Project" and "New Template" buttons in the header', () => {
        renderDashboard();
        expect(screen.getByRole('button', { name: /new project/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /new template/i })).toBeInTheDocument();
    });

    it('opens the template modal when the "New Template" button is clicked', () => {
        renderDashboard();
        fireEvent.click(screen.getByRole('button', { name: /new template/i }));
        expect(setShowTemplateModal).toHaveBeenCalledTimes(1);
        expect(setShowTemplateModal).toHaveBeenCalledWith(true);
        // The project modal must NOT be opened by the template button.
        expect(setShowCreateModal).not.toHaveBeenCalled();
    });

    it('opens the project modal when the "New Project" button is clicked', () => {
        renderDashboard();
        fireEvent.click(screen.getByRole('button', { name: /new project/i }));
        expect(setShowCreateModal).toHaveBeenCalledTimes(1);
        expect(setShowCreateModal).toHaveBeenCalledWith(true);
        expect(setShowTemplateModal).not.toHaveBeenCalled();
    });
});
