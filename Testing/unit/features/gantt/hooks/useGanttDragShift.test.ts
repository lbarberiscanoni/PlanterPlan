import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HierarchyTask } from '@/shared/db/app.types';

const mutateAsync = vi.fn();
const invalidate = vi.fn();
const toastError = vi.fn();

vi.mock('sonner', () => ({
    toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { useGanttDragShift } from '@/features/gantt/hooks/useGanttDragShift';

function wrapper({ children }: { children: ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    qc.invalidateQueries = invalidate as typeof qc.invalidateQueries;
    return createElement(QueryClientProvider, { client: qc }, children);
}

function makeTask(overrides: Partial<HierarchyTask> & { id: string }): HierarchyTask {
    return {
        id: overrides.id,
        root_id: overrides.root_id ?? 'p1',
        parent_task_id: overrides.parent_task_id ?? null,
        position: 0,
        title: 'T',
        task_type: overrides.task_type ?? 'milestone',
        start_date: overrides.start_date ?? null,
        due_date: overrides.due_date ?? null,
        is_complete: false,
        status: 'todo',
        settings: null,
        description: null,
        notes: null,
        purpose: null,
        actions: null,
        days_from_start: null,
        duration_days: null,
        assignee_id: null,
        is_locked: null,
        prerequisite_phase_id: null,
        origin: 'instance',
        creator: null,
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        ...overrides,
    } as HierarchyTask;
}

describe('useGanttDragShift (Wave 28)', () => {
    beforeEach(() => {
        mutateAsync.mockReset();
        invalidate.mockReset();
        toastError.mockReset();
    });

    it('persists iso dates when drag is in-bounds', async () => {
        const tasks = [
            makeTask({ id: 'ph1', parent_task_id: 'p1', task_type: 'phase', start_date: '2026-01-01', due_date: '2026-01-31' }),
            makeTask({ id: 'm1', parent_task_id: 'ph1', start_date: '2026-01-05', due_date: '2026-01-10' }),
        ];
        mutateAsync.mockResolvedValue({});

        const { result } = renderHook(
            () => useGanttDragShift({ projectId: 'p1', tasks, updateTaskDates: mutateAsync }),
            { wrapper },
        );

        await result.current('m1', new Date('2026-01-06T00:00:00Z'), new Date('2026-01-12T00:00:00Z'));

        expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
            id: 'm1',
            start_date: '2026-01-06',
            due_date: '2026-01-12',
        }));
        expect(toastError).not.toHaveBeenCalled();
    });

    it('rejects when drag exceeds the parent phase end-date', async () => {
        const tasks = [
            makeTask({ id: 'ph1', parent_task_id: 'p1', task_type: 'phase', start_date: '2026-01-01', due_date: '2026-01-31' }),
            makeTask({ id: 'm1', parent_task_id: 'ph1', start_date: '2026-01-05', due_date: '2026-01-10' }),
        ];

        const { result } = renderHook(
            () => useGanttDragShift({ projectId: 'p1', tasks, updateTaskDates: mutateAsync }),
            { wrapper },
        );

        await result.current('m1', new Date('2026-01-06T00:00:00Z'), new Date('2026-02-15T00:00:00Z'));

        expect(mutateAsync).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledWith('Move the parent phase first.');
    });

    it('rejects inverted dates (end before start)', async () => {
        const tasks = [
            makeTask({ id: 'ph1', parent_task_id: 'p1', task_type: 'phase', start_date: '2026-01-01', due_date: '2026-01-31' }),
        ];

        const { result } = renderHook(
            () => useGanttDragShift({ projectId: 'p1', tasks, updateTaskDates: mutateAsync }),
            { wrapper },
        );

        await result.current('ph1', new Date('2026-01-20T00:00:00Z'), new Date('2026-01-10T00:00:00Z'));

        expect(mutateAsync).not.toHaveBeenCalled();
        expect(toastError).toHaveBeenCalledWith('Invalid date range.');
    });

    it('force-refetches and toasts on mutation error', async () => {
        const tasks = [
            makeTask({ id: 'ph1', parent_task_id: 'p1', task_type: 'phase', start_date: '2026-01-01', due_date: '2026-01-31' }),
            makeTask({ id: 'm1', parent_task_id: 'ph1', start_date: '2026-01-05', due_date: '2026-01-10' }),
        ];
        mutateAsync.mockRejectedValueOnce(new Error('boom'));

        const { result } = renderHook(
            () => useGanttDragShift({ projectId: 'p1', tasks, updateTaskDates: mutateAsync }),
            { wrapper },
        );

        await result.current('m1', new Date('2026-01-06T00:00:00Z'), new Date('2026-01-12T00:00:00Z'));

        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['projectHierarchy', 'p1'] });
        expect(toastError).toHaveBeenCalledWith('Could not save change.');
    });
});
