import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const mockCreateProject = vi.fn();
const mockCreateTemplate = vi.fn();

vi.mock('@/features/projects/hooks/useProjectMutations', () => ({
    useCreateProject: () => ({ mutateAsync: mockCreateProject }),
}));

vi.mock('@/features/library/hooks/useTemplateMutations', () => ({
    useCreateTemplate: () => ({ mutateAsync: mockCreateTemplate }),
}));

vi.mock('@/features/library/hooks/useMasterLibrarySearch', () => ({
    default: () => ({ results: [], isLoading: false }),
}));

vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({ user: { id: 'user-1', email: 'user@example.com' } }),
}));

vi.mock('@/features/projects/components/CreateProjectModal', () => ({
    default: ({
        open,
        onSubmit,
        initialValues,
        initialStep,
    }: {
        open: boolean;
        onSubmit: (data: { title: string; start_date: string }) => Promise<void>;
        initialValues?: { title?: string; start_date?: string; templateSeedKey?: string };
        initialStep?: 1 | 2;
    }) => (
        open ? (
            <button
                type="button"
                data-testid="create-project-modal"
                data-initial-title={initialValues?.title ?? ''}
                data-initial-start-date={initialValues?.start_date ?? ''}
                data-initial-template={initialValues?.templateSeedKey ?? ''}
                data-initial-step={initialStep ?? 1}
                onClick={() => void onSubmit({ title: 'Project from action', start_date: '2026-06-01' })}
            >
                create project
            </button>
        ) : null
    ),
}));

vi.mock('@/features/library/components/CreateTemplateModal', () => ({
    default: ({ open, onSubmit }: { open: boolean; onSubmit: (data: { title: string; description: string; isPublished: boolean }) => Promise<void> }) => (
        open ? (
            <button
                type="button"
                data-testid="create-template-modal"
                onClick={() => void onSubmit({ title: 'Template from action', description: 'Reusable', isPublished: true })}
            >
                create template
            </button>
        ) : null
    ),
}));

import CreationActionHost from '@/layouts/CreationActionHost';

function LocationDisplay() {
    const location = useLocation();
    return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderHost(initialEntry: string) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    function Wrapper({ children }: { children: ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
            </QueryClientProvider>
        );
    }

    return render(
        <>
            <CreationActionHost />
            <LocationDisplay />
        </>,
        { wrapper: Wrapper },
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockCreateProject.mockResolvedValue({ id: 'project-1' });
    mockCreateTemplate.mockResolvedValue({ id: 'template-1' });
});

describe('CreationActionHost', () => {
    it('opens project creation from the URL action and clears the query param', async () => {
        renderHost('/tasks?action=new-project');

        expect(await screen.findByTestId('create-project-modal')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/tasks');
        });
    });

    it('passes project creation query params as initial modal values before clearing the URL', async () => {
        renderHost('/tasks?action=new-project&title=Onboarding%20Church&start_date=2026-07-04&template=launch_large');

        const modal = await screen.findByTestId('create-project-modal');
        expect(modal).toHaveAttribute('data-initial-title', 'Onboarding Church');
        expect(modal).toHaveAttribute('data-initial-start-date', '2026-07-04');
        expect(modal).toHaveAttribute('data-initial-template', 'launch_large');
        expect(modal).toHaveAttribute('data-initial-step', '2');
        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/tasks');
        });
    });

    it('opens template creation from the URL action and clears the query param', async () => {
        renderHost('/tasks?action=new-template');

        expect(await screen.findByTestId('create-template-modal')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByTestId('location')).toHaveTextContent('/tasks');
        });
    });

    it('submits project creation and navigates to the new project', async () => {
        renderHost('/tasks?action=new-project');

        fireEvent.click(await screen.findByTestId('create-project-modal'));

        await waitFor(() => {
            expect(mockCreateProject).toHaveBeenCalledWith({
                title: 'Project from action',
                description: undefined,
                start_date: '2026-06-01',
                templateId: undefined,
            });
            expect(screen.getByTestId('location')).toHaveTextContent('/project/project-1');
        });
    });

    it('submits template creation through the library mutation and navigates to the template', async () => {
        renderHost('/tasks?action=new-template');

        fireEvent.click(await screen.findByTestId('create-template-modal'));

        await waitFor(() => {
            expect(mockCreateTemplate).toHaveBeenCalledWith(expect.objectContaining({
                title: 'Template from action',
                description: 'Reusable',
                isPublished: true,
                userId: 'user-1',
            }));
            expect(screen.getByTestId('location')).toHaveTextContent('/project/template-1');
        });
    });
});
