import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockListByProject = vi.fn();
const mockListByEntity = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            ActivityLog: {
                listByProject: (...args: unknown[]) => mockListByProject(...args),
                listByEntity: (...args: unknown[]) => mockListByEntity(...args),
            },
        },
    },
}));

import { useProjectActivity, useTaskActivity } from '@/shared/hooks/useActivityLog';

function makeWrapper() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);
    return { qc, Wrapper };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useProjectActivity (Wave 27)', () => {
    it('uses the [activityLog, projectId, opts] cache key and calls listByProject', async () => {
        mockListByProject.mockResolvedValue([{ id: 'a1' }]);
        const { Wrapper, qc } = makeWrapper();

        const { result } = renderHook(
            () => useProjectActivity('p1', { limit: 10 }),
            { wrapper: Wrapper },
        );

        await waitFor(() => expect(result.current.data).toEqual([{ id: 'a1' }]));
        expect(mockListByProject).toHaveBeenCalledWith('p1', { limit: 10 });
        expect(qc.getQueryData(['activityLog', 'p1', { limit: 10 }])).toEqual([{ id: 'a1' }]);
    });

    it('skips the query when projectId is null', async () => {
        mockListByProject.mockResolvedValue([]);
        const { Wrapper } = makeWrapper();
        renderHook(() => useProjectActivity(null), { wrapper: Wrapper });
        await new Promise((r) => setTimeout(r, 10));
        expect(mockListByProject).not.toHaveBeenCalled();
    });

    it('spawns a fresh fetch when entityTypes opts change (key-invalidation behavior)', async () => {
        mockListByProject.mockResolvedValue([]);
        const { Wrapper } = makeWrapper();

        const { rerender } = renderHook(
            ({ types }: { types: readonly ('task' | 'comment' | 'member' | 'project')[] }) =>
                useProjectActivity('p1', { entityTypes: types }),
            { wrapper: Wrapper, initialProps: { types: ['task'] as const } },
        );
        await waitFor(() => expect(mockListByProject).toHaveBeenCalledTimes(1));

        rerender({ types: ['comment'] as const });
        await waitFor(() => expect(mockListByProject).toHaveBeenCalledTimes(2));
        expect(mockListByProject).toHaveBeenLastCalledWith('p1', { entityTypes: ['comment'] });
    });
});

describe('useTaskActivity (Wave 27)', () => {
    it('uses [activityLog, task, taskId, opts] cache key and calls listByEntity("task", taskId)', async () => {
        mockListByEntity.mockResolvedValue([{ id: 'a1' }]);
        const { Wrapper, qc } = makeWrapper();

        const { result } = renderHook(
            () => useTaskActivity('t1', { limit: 5 }),
            { wrapper: Wrapper },
        );

        await waitFor(() => expect(result.current.data).toEqual([{ id: 'a1' }]));
        expect(mockListByEntity).toHaveBeenCalledWith('task', 't1', { limit: 5 });
        expect(qc.getQueryData(['activityLog', 'task', 't1', { limit: 5 }])).toEqual([{ id: 'a1' }]);
    });

    it('skips the query when taskId is null', async () => {
        mockListByEntity.mockResolvedValue([]);
        const { Wrapper } = makeWrapper();
        renderHook(() => useTaskActivity(null), { wrapper: Wrapper });
        await new Promise((r) => setTimeout(r, 10));
        expect(mockListByEntity).not.toHaveBeenCalled();
    });
});
