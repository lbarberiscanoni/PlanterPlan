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

// Minimal useAuth stub so we control `user.id`.
const authHolder = { user: { id: 'user-1' } as { id: string } | null };
vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({ user: authHolder.user }),
}));

const templateSearchHolder = {
    results: [{ id: 'tmpl-42', title: 'Follow-up One', description: 'Follow-up description' }],
    isLoading: false,
    hasResults: true,
    exclusionDrained: false,
};
vi.mock('@/shared/hooks/useMasterLibrarySearch', () => ({
    default: () => templateSearchHolder,
    useMasterLibrarySearch: () => templateSearchHolder,
}));

// Wave 25: the dialog also calls `useRelatedTemplates`. Stub it out here so
// these tests focus on the search path — the related-section has its own
// dedicated test file (`StrategyFollowUpDialog.related.test.tsx`).
vi.mock('@/shared/hooks/useRelatedTemplates', () => ({
    default: () => ({ results: [], isLoading: false, hasResults: false }),
    useRelatedTemplates: () => ({ results: [], isLoading: false, hasResults: false }),
}));

import StrategyFollowUpDialog from '@/features/tasks/components/StrategyFollowUpDialog';

function renderDialog(task: TaskRow, open = true) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const onOpenChange = vi.fn();
    const utils = render(
        <QueryClientProvider client={queryClient}>
            <StrategyFollowUpDialog
                task={task}
                open={open}
                onOpenChange={onOpenChange}
                excludeTemplateIds={[]}
            />
        </QueryClientProvider>,
    );
    return { ...utils, invalidateSpy, onOpenChange, queryClient };
}

beforeEach(() => {
    vi.clearAllMocks();
    authHolder.user = { id: 'user-1' };
    templateSearchHolder.results = [
        { id: 'tmpl-42', title: 'Follow-up One', description: 'Follow-up description' },
    ];
    templateSearchHolder.isLoading = false;
    templateSearchHolder.hasResults = true;
    templateSearchHolder.exclusionDrained = false;
});

describe('StrategyFollowUpDialog (Wave 24 Task 2)', () => {
    it('renders the follow-up prompt when open', () => {
        renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
            }) as TaskRow,
        );
        expect(screen.getByText(/Add follow-up tasks/i)).toBeDefined();
        expect(screen.getByLabelText(/Search Master Library/i)).toBeDefined();
    });

    it('clones the selected template as a sibling and invalidates projectHierarchy', async () => {
        mockClone.mockResolvedValueOnce({ data: { id: 'new-id' }, error: null });
        const task = makeTask({
            id: 't-strat',
            parent_task_id: 'parent-A',
            root_id: 'proj-1',
            status: 'completed',
        }) as TaskRow;
        const { invalidateSpy } = renderDialog(task);

        await act(async () => {
            fireEvent.focus(screen.getByLabelText(/Search Master Library/i));
            fireEvent.click(screen.getByTestId('strategy-followup-search-row-tmpl-42'));
        });

        await waitFor(() => expect(mockClone).toHaveBeenCalledTimes(1));
        expect(mockClone).toHaveBeenCalledWith('tmpl-42', 'parent-A', 'instance', 'user-1');
        expect(invalidateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ queryKey: ['projectHierarchy', 'proj-1'] }),
        );
        expect(mockToastSuccess).toHaveBeenCalled();
    });

    it('uses the task id as rootId when root_id is absent', async () => {
        mockClone.mockResolvedValueOnce({ data: { id: 'new-id' }, error: null });
        const task = makeTask({
            id: 't-strat',
            parent_task_id: null,
            root_id: null,
            status: 'completed',
        }) as TaskRow;
        const { invalidateSpy } = renderDialog(task);

        await act(async () => {
            fireEvent.focus(screen.getByLabelText(/Search Master Library/i));
            fireEvent.click(screen.getByTestId('strategy-followup-search-row-tmpl-42'));
        });

        await waitFor(() => expect(mockClone).toHaveBeenCalled());
        expect(mockClone).toHaveBeenCalledWith('tmpl-42', null, 'instance', 'user-1');
        expect(invalidateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ queryKey: ['projectHierarchy', 't-strat'] }),
        );
    });

    it('surfaces an error toast and skips clone when the user is not signed in', async () => {
        authHolder.user = null;
        const task = makeTask({
            id: 't-strat',
            parent_task_id: 'parent-A',
            root_id: 'proj-1',
            status: 'completed',
        }) as TaskRow;
        renderDialog(task);

        await act(async () => {
            fireEvent.focus(screen.getByLabelText(/Search Master Library/i));
            fireEvent.click(screen.getByTestId('strategy-followup-search-row-tmpl-42'));
        });

        expect(mockClone).not.toHaveBeenCalled();
        expect(mockToastError).toHaveBeenCalledWith('Not signed in');
    });

    it('surfaces an error toast when Task.clone returns an error', async () => {
        mockClone.mockResolvedValueOnce({ data: null, error: new Error('permission denied') });
        const task = makeTask({
            id: 't-strat',
            parent_task_id: 'parent-A',
            root_id: 'proj-1',
            status: 'completed',
        }) as TaskRow;
        renderDialog(task);

        await act(async () => {
            fireEvent.focus(screen.getByLabelText(/Search Master Library/i));
            fireEvent.click(screen.getByTestId('strategy-followup-search-row-tmpl-42'));
        });

        await waitFor(() => expect(mockToastError).toHaveBeenCalled());
        expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('does not activate a search option when ArrowDown is pressed with no results', () => {
        templateSearchHolder.results = [];
        templateSearchHolder.hasResults = false;
        const task = makeTask({
            id: 't-strat',
            parent_task_id: 'parent-A',
            root_id: 'proj-1',
            status: 'completed',
        }) as TaskRow;
        renderDialog(task);

        const input = screen.getByLabelText(/Search Master Library/i);
        fireEvent.focus(input);
        fireEvent.keyDown(input, { key: 'ArrowDown' });

        expect(input.getAttribute('aria-activedescendant')).toBeNull();
    });

    it('closes via the footer button', () => {
        const { onOpenChange } = renderDialog(
            makeTask({
                id: 't-strat',
                parent_task_id: 'parent-A',
                root_id: 'proj-1',
                status: 'completed',
            }) as TaskRow,
        );
        fireEvent.click(screen.getByTestId('strategy-followup-done'));
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
