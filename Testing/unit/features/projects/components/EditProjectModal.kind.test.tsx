import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmDialogProvider } from '@/shared/ui/confirm-dialog';
import { makeTask } from '@test';
import type { TaskRow } from '@/shared/db/app.types';

const mockUpdateMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockSetArchivedMutateAsync = vi.fn();

vi.mock('@/features/projects/hooks/useProjectMutations', () => ({
    useUpdateProject: () => ({ mutateAsync: mockUpdateMutateAsync }),
    useDeleteProject: () => ({ mutateAsync: mockDeleteMutateAsync }),
    useSetProjectArchived: () => ({ mutateAsync: mockSetArchivedMutateAsync, isPending: false }),
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/api/planterClient', () => ({
    default: { functions: { invoke: vi.fn() } },
}));

import EditProjectModal from '@/features/projects/components/EditProjectModal';

function renderModal(project: TaskRow) {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <ConfirmDialogProvider>
                    <EditProjectModal project={project} isOpen={true} onClose={vi.fn()} />
                </ConfirmDialogProvider>
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateMutateAsync.mockResolvedValue({ shiftedCount: 0 });
    mockSetArchivedMutateAsync.mockResolvedValue(undefined);
});

describe('EditProjectModal — project kind picker (Wave 29)', () => {
    it('renders the kind RadioGroup for an instance root task', () => {
        renderModal(
            makeTask({
                id: 'p1',
                title: 'Instance Root',
                parent_task_id: null,
                origin: 'instance',
                start_date: '2026-01-01',
                settings: null,
            }),
        );
        expect(screen.getByTestId('project-kind-section')).toBeInTheDocument();
        expect(screen.getByLabelText(/date-driven/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/checkpoint-based/i)).toBeInTheDocument();
    });

    it('hides the kind picker for templates', () => {
        renderModal(
            makeTask({
                id: 't1',
                title: 'Template',
                parent_task_id: null,
                origin: 'template',
                start_date: '2026-01-01',
                settings: null,
            }),
        );
        expect(screen.queryByTestId('project-kind-section')).toBeNull();
    });

    it('submits with settings.project_kind = "checkpoint" after the user picks checkpoint', async () => {
        renderModal(
            makeTask({
                id: 'p1',
                title: 'Instance Root',
                parent_task_id: null,
                origin: 'instance',
                start_date: '2026-01-01',
                settings: null,
            }),
        );

        fireEvent.click(screen.getByLabelText(/checkpoint-based/i));
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        });

        await waitFor(() => {
            expect(mockUpdateMutateAsync).toHaveBeenCalled();
        });
        const payload = mockUpdateMutateAsync.mock.calls[0][0];
        const settings = (payload.updates as { settings: Record<string, unknown> }).settings;
        expect(settings.project_kind).toBe('checkpoint');
    });

    it('opens the confirmation dialog when switching from checkpoint back to date', () => {
        renderModal(
            makeTask({
                id: 'p1',
                title: 'Checkpoint Project',
                parent_task_id: null,
                origin: 'instance',
                start_date: '2026-01-01',
                settings: { project_kind: 'checkpoint' },
            }),
        );

        fireEvent.click(screen.getByLabelText(/date-driven/i));
        expect(screen.getByTestId('project-kind-revert-dialog')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /switch to date-driven/i })).toBeInTheDocument();
    });

    it('commits the revert to date after the user confirms', async () => {
        renderModal(
            makeTask({
                id: 'p1',
                title: 'Checkpoint Project',
                parent_task_id: null,
                origin: 'instance',
                start_date: '2026-01-01',
                settings: { project_kind: 'checkpoint' },
            }),
        );

        fireEvent.click(screen.getByLabelText(/date-driven/i));
        fireEvent.click(screen.getByRole('button', { name: /switch to date-driven/i }));

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        });

        await waitFor(() => expect(mockUpdateMutateAsync).toHaveBeenCalled());
        const payload = mockUpdateMutateAsync.mock.calls[0][0];
        const settings = (payload.updates as { settings: Record<string, unknown> }).settings;
        expect(settings.project_kind).toBe('date');
    });

    it('keeps the kind as checkpoint when the user cancels the revert', () => {
        renderModal(
            makeTask({
                id: 'p1',
                title: 'Checkpoint Project',
                parent_task_id: null,
                origin: 'instance',
                start_date: '2026-01-01',
                settings: { project_kind: 'checkpoint' },
            }),
        );

        fireEvent.click(screen.getByLabelText(/date-driven/i));
        fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

        // The checkpoint radio should still be checked
        const checkpointRadio = screen.getByLabelText(/checkpoint-based/i);
        expect(checkpointRadio).toBeChecked();
    });
});
