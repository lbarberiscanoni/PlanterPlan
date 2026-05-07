import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ActivityLogWithActor } from '@/shared/db/app.types';

const mockUseProjectActivity = vi.fn();
const mockListByProject = vi.fn();

vi.mock('@/shared/hooks/useActivityLog', () => ({
    useProjectActivity: (...args: unknown[]) => mockUseProjectActivity(...args),
    useTaskActivity: () => ({ data: [], isLoading: false }),
}));

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            ActivityLog: {
                listByProject: (...args: unknown[]) => mockListByProject(...args),
            },
        },
    },
}));

import ProjectActivityTab from '@/features/projects/components/ProjectActivityTab';

function rowOf(overrides: Partial<ActivityLogWithActor> = {}): ActivityLogWithActor {
    return {
        id: overrides.id ?? `row-${Math.random().toString(36).slice(2, 8)}`,
        project_id: 'p1',
        actor_id: 'u1',
        entity_type: overrides.entity_type ?? 'task',
        entity_id: overrides.entity_id ?? 't1',
        action: overrides.action ?? 'created',
        payload: overrides.payload ?? { title: 'First' },
        created_at: overrides.created_at ?? new Date().toISOString(),
        actor: overrides.actor ?? { id: 'u1', email: 'alice@example.com', user_metadata: {} },
        ...overrides,
    } as ActivityLogWithActor;
}

function renderSut(props: { projectId?: string | null } = {}) {
    const qc = new QueryClient();
    return render(
        <QueryClientProvider client={qc}>
            <ProjectActivityTab projectId={props.projectId ?? 'p1'} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectActivity.mockReturnValue({ data: [], isLoading: false });
});

describe('ProjectActivityTab (Wave 27)', () => {
    it('renders the empty-state copy when there are no rows', () => {
        renderSut();
        expect(screen.getByTestId('activity-empty')).toHaveTextContent(
            /no activity yet — create a task or invite a teammate to get started\./i,
        );
    });

    it('groups rows into Today / Yesterday day buckets', () => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const rows = [
            rowOf({ id: 't-today', created_at: today.toISOString(), entity_type: 'task' }),
            rowOf({ id: 't-yesterday', created_at: yesterday.toISOString(), entity_type: 'task' }),
        ];
        mockUseProjectActivity.mockReturnValue({ data: rows, isLoading: false });

        renderSut();

        expect(screen.getByTestId('activity-day-Today')).toContainElement(
            screen.getByTestId('activity-row-t-today'),
        );
        expect(screen.getByTestId('activity-day-Yesterday')).toContainElement(
            screen.getByTestId('activity-row-t-yesterday'),
        );
    });

    it('filter chips filter client-side (no refetch), toggling class/data-active state', () => {
        const rows = [
            rowOf({ id: 'r-task', entity_type: 'task' }),
            rowOf({ id: 'r-comment', entity_type: 'comment', action: 'comment_posted', payload: { body_preview: 'hi' } }),
            rowOf({ id: 'r-member', entity_type: 'member', action: 'member_added', payload: { role: 'editor' } }),
        ];
        mockUseProjectActivity.mockReturnValue({ data: rows, isLoading: false });

        renderSut();

        // All three visible under the "All" filter.
        expect(screen.getByTestId('activity-row-r-task')).toBeInTheDocument();
        expect(screen.getByTestId('activity-row-r-comment')).toBeInTheDocument();
        expect(screen.getByTestId('activity-row-r-member')).toBeInTheDocument();

        const initialCallCount = mockUseProjectActivity.mock.calls.length;

        // Click "Comments" — only the comment row should remain.
        fireEvent.click(screen.getByTestId('activity-filter-comment'));
        expect(screen.queryByTestId('activity-row-r-task')).toBeNull();
        expect(screen.getByTestId('activity-row-r-comment')).toBeInTheDocument();
        expect(screen.queryByTestId('activity-row-r-member')).toBeNull();

        // Hook mock was not called with new opts — client-side filtering only.
        const postClickCalls = mockUseProjectActivity.mock.calls.length;
        // There may be renders, but the `opts` object passed to the hook
        // shouldn't add an `entityTypes` key (filter is local state).
        for (let i = initialCallCount; i < postClickCalls; i++) {
            const [, opts] = mockUseProjectActivity.mock.calls[i];
            expect((opts as Record<string, unknown>).entityTypes).toBeUndefined();
        }

        // Active-state marker swapped to 'comment'.
        expect(screen.getByTestId('activity-filter-comment')).toHaveAttribute('data-active', 'true');
        expect(screen.getByTestId('activity-filter-all')).toHaveAttribute('data-active', 'false');
    });

    it('surfaces the "Load older" button only when returned rows reach the current limit', () => {
        // 50 rows → at the default limit → button appears
        const fullPage = Array.from({ length: 50 }, (_, i) =>
            rowOf({ id: `r-${i}`, entity_type: 'task' }),
        );
        mockUseProjectActivity.mockReturnValue({ data: fullPage, isLoading: false });
        const { unmount } = renderSut();
        expect(screen.getByTestId('activity-load-older')).toBeInTheDocument();
        unmount();

        // 3 rows → below limit → no button
        mockUseProjectActivity.mockReturnValue({
            data: [rowOf(), rowOf(), rowOf()],
            isLoading: false,
        });
        renderSut();
        expect(screen.queryByTestId('activity-load-older')).toBeNull();
    });

    it('"Load older" pages backwards via the `before` cursor and appends (no limit-bump refetch)', async () => {
        const firstPage = Array.from({ length: 50 }, (_, i) =>
            rowOf({
                id: `first-${i}`,
                entity_type: 'task',
                created_at: new Date(2026, 3, 18, 12, 59 - i).toISOString(),
            }),
        );
        const olderBatch = [
            rowOf({ id: 'older-1', entity_type: 'comment', action: 'comment_posted' }),
            rowOf({ id: 'older-2', entity_type: 'task' }),
        ];
        mockUseProjectActivity.mockReturnValue({ data: firstPage, isLoading: false });
        mockListByProject.mockResolvedValue(olderBatch);

        renderSut({ projectId: 'p1' });

        const btn = screen.getByTestId('activity-load-older');
        await React.act(async () => {
            fireEvent.click(btn);
        });

        // Server call was keyed by the last row's created_at, not a bigger limit.
        expect(mockListByProject).toHaveBeenCalledTimes(1);
        const [pid, opts] = mockListByProject.mock.calls[0] as [string, Record<string, unknown>];
        expect(pid).toBe('p1');
        expect(opts).toMatchObject({ limit: 50, before: firstPage[firstPage.length - 1].created_at });

        // The older rows append to the view — both page slices are present.
        expect(screen.getByTestId('activity-row-first-0')).toBeInTheDocument();
        expect(screen.getByTestId('activity-row-older-1')).toBeInTheDocument();
        expect(screen.getByTestId('activity-row-older-2')).toBeInTheDocument();
    });

    it('shows a filter-specific empty state when no rows match the active filter', () => {
        // Rows exist (all tasks), but switching to "comment" filter leaves the view empty.
        const rows = [rowOf({ id: 'r-task', entity_type: 'task' })];
        mockUseProjectActivity.mockReturnValue({ data: rows, isLoading: false });

        renderSut();
        fireEvent.click(screen.getByTestId('activity-filter-comment'));

        const empty = screen.getByTestId('activity-empty');
        expect(empty).toHaveTextContent(/no activity matches this filter\./i);
        expect(empty).not.toHaveTextContent(/create a task or invite a teammate/i);
    });
});
