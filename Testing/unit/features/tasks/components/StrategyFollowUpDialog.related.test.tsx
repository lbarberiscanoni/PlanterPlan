import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeTask } from '@test';
import type { TaskRow } from '@/shared/db/app.types';

// ---- Mocks (declared BEFORE component import) ----

const mockClone = vi.fn();
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            Task: {
                clone: (...args: unknown[]) => mockClone(...args),
            },
        },
    },
}));

vi.mock('@/shared/db/client', () => ({
    supabase: {
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        },
    },
}));

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();
vi.mock('sonner', () => ({
    toast: {
        success: (...args: unknown[]) => mockToastSuccess(...args),
        error: (...args: unknown[]) => mockToastError(...args),
    },
}));

const authHolder = { user: { id: 'user-1' } as { id: string } | null };
vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({ user: authHolder.user }),
}));

vi.mock('@/shared/hooks/useMasterLibrarySearch', () => ({
    default: () => ({ results: [], isLoading: false, hasResults: false, exclusionDrained: false }),
    useMasterLibrarySearch: () => ({ results: [], isLoading: false, hasResults: false, exclusionDrained: false }),
}));

// Control the related suggestions directly.
const relatedHolder: {
    results: Array<{ id: string; title?: string; description?: string }>;
    isLoading: boolean;
    hasResults: boolean;
} = { results: [], isLoading: false, hasResults: false };
vi.mock('@/shared/hooks/useRelatedTemplates', () => ({
    default: () => relatedHolder,
    useRelatedTemplates: () => relatedHolder,
}));

import StrategyFollowUpDialog from '@/features/tasks/components/StrategyFollowUpDialog';

function renderDialog(task: TaskRow) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const onOpenChange = vi.fn();
    const utils = render(
        <QueryClientProvider client={queryClient}>
            <StrategyFollowUpDialog
                task={task}
                open={true}
                onOpenChange={onOpenChange}
                excludeTemplateIds={[]}
            />
        </QueryClientProvider>,
    );
    return { ...utils, invalidateSpy, onOpenChange };
}

beforeEach(() => {
    vi.clearAllMocks();
    authHolder.user = { id: 'user-1' };
    relatedHolder.results = [];
    relatedHolder.isLoading = false;
    relatedHolder.hasResults = false;
});

describe('StrategyFollowUpDialog — Related templates (Wave 25 Task 1)', () => {
    it('renders the Related templates section when the seed has title/description', () => {
        relatedHolder.results = [
            { id: 't-a', title: 'Template A', description: 'desc a' },
            { id: 't-b', title: 'Template B', description: 'desc b' },
        ];
        relatedHolder.hasResults = true;
        renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
                title: 'Launch grand opening service',
                description: 'Plan the grand opening service',
            }) as TaskRow,
        );
        expect(screen.getByTestId('strategy-followup-related')).toBeDefined();
        expect(screen.getByTestId('strategy-followup-related-row-t-a')).toBeDefined();
        expect(screen.getByTestId('strategy-followup-related-row-t-b')).toBeDefined();
    });

    it('omits the Related templates section when the seed has no title/description', () => {
        renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
                title: '',
                description: '',
            }) as TaskRow,
        );
        expect(screen.queryByTestId('strategy-followup-related')).toBeNull();
    });

    it('shows a "no related templates" message when the section is empty but the seed has text', () => {
        renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
                title: 'Completely unique title',
                description: 'no overlap',
            }) as TaskRow,
        );
        expect(screen.getByTestId('strategy-followup-related')).toBeDefined();
        expect(screen.getByText(/No related templates found/i)).toBeDefined();
    });

    it('clicking a related row clones the template and invalidates the project cache', async () => {
        relatedHolder.results = [
            { id: 'tmpl-99', title: 'Related Template', description: 'desc' },
        ];
        relatedHolder.hasResults = true;
        mockClone.mockResolvedValueOnce({ data: { id: 'new-id' }, error: null });

        const { invalidateSpy } = renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
                title: 'Launch grand opening service',
                description: 'Plan the launch',
            }) as TaskRow,
        );

        await act(async () => {
            fireEvent.click(screen.getByTestId('strategy-followup-related-row-tmpl-99'));
        });

        await waitFor(() => expect(mockClone).toHaveBeenCalledTimes(1));
        expect(mockClone).toHaveBeenCalledWith('tmpl-99', 'parent-A', 'instance', 'user-1');
        expect(invalidateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ queryKey: ['projectHierarchy', 'proj-1'] }),
        );
        expect(mockToastSuccess).toHaveBeenCalled();
    });

    it('surfaces a toast error when the clone fails', async () => {
        relatedHolder.results = [
            { id: 'tmpl-99', title: 'Related Template', description: 'desc' },
        ];
        relatedHolder.hasResults = true;
        mockClone.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });

        renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
                title: 'Launch grand opening service',
                description: 'Plan the launch',
            }) as TaskRow,
        );

        await act(async () => {
            fireEvent.click(screen.getByTestId('strategy-followup-related-row-tmpl-99'));
        });

        await waitFor(() => expect(mockToastError).toHaveBeenCalled());
        expect(mockToastSuccess).not.toHaveBeenCalled();
    });
});
