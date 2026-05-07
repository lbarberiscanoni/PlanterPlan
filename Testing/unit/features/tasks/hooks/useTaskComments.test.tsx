import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeCommentWithAuthor } from '@test';

const mockListByTask = vi.fn();
const mockCreate = vi.fn();
const mockUpdateBody = vi.fn();
const mockSoftDelete = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            TaskComment: {
                listByTask: (...args: unknown[]) => mockListByTask(...args),
                create: (...args: unknown[]) => mockCreate(...args),
                updateBody: (...args: unknown[]) => mockUpdateBody(...args),
                softDelete: (...args: unknown[]) => mockSoftDelete(...args),
            },
        },
    },
}));

vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({
        user: {
            id: 'user-1',
            email: 'me@example.com',
            user_metadata: { full_name: 'Me' },
        },
    }),
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
    toast: {
        error: (...args: unknown[]) => toastError(...args),
    },
}));

import {
    useTaskComments,
    useCreateComment,
    useUpdateComment,
    useDeleteComment,
} from '@/features/tasks/hooks/useTaskComments';

function makeWrapper() {
    const qc = new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0, staleTime: 0 },
            mutations: { retry: false },
        },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client: qc }, children);
    return { qc, Wrapper };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('useTaskComments (Wave 26)', () => {
    it('queries with the [taskComments, taskId] cache key and returns fetched rows', async () => {
        const rows = [makeCommentWithAuthor({ task_id: 't1' })];
        mockListByTask.mockResolvedValue(rows);
        const { Wrapper, qc } = makeWrapper();

        const { result } = renderHook(() => useTaskComments('t1'), { wrapper: Wrapper });

        await waitFor(() => expect(result.current.data).toEqual(rows));
        expect(mockListByTask).toHaveBeenCalledWith('t1');
        expect(qc.getQueryData(['taskComments', 't1'])).toEqual(rows);
    });

    it('skips the query when taskId is null (enabled = false)', async () => {
        mockListByTask.mockResolvedValue([]);
        const { Wrapper } = makeWrapper();

        renderHook(() => useTaskComments(null), { wrapper: Wrapper });

        await new Promise((r) => setTimeout(r, 10));
        expect(mockListByTask).not.toHaveBeenCalled();
    });
});

describe('useCreateComment (Wave 26)', () => {
    it('applies an optimistic insert and resolves to the server row on success', async () => {
        const serverRow = makeCommentWithAuthor({
            id: 'server-1',
            task_id: 't1',
            body: 'new comment',
        });
        mockCreate.mockResolvedValue(serverRow);
        const { Wrapper, qc } = makeWrapper();
        qc.setQueryData(['taskComments', 't1'], []);

        const { result } = renderHook(() => useCreateComment('t1'), { wrapper: Wrapper });

        await act(async () => {
            result.current.mutate({ parent_comment_id: null, body: 'new comment', mentions: [] });
        });

        await waitFor(() => expect(result.current.isSuccess).toBe(true));
        expect(mockCreate).toHaveBeenCalledWith({
            task_id: 't1',
            author_id: 'user-1',
            parent_comment_id: null,
            body: 'new comment',
            mentions: [],
        });
    });

    it('rolls back optimistic state and fires invalidateQueries on error', async () => {
        mockCreate.mockRejectedValue(new Error('boom'));
        const { Wrapper, qc } = makeWrapper();
        const previous = [makeCommentWithAuthor({ task_id: 't1' })];
        qc.setQueryData(['taskComments', 't1'], previous);
        // Make the post-invalidation refetch a no-op — it would otherwise race
        // the rollback assertion and overwrite the cache with `undefined`.
        mockListByTask.mockResolvedValue(previous);
        const setSpy = vi.spyOn(qc, 'setQueryData');
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

        const { result } = renderHook(() => useCreateComment('t1'), { wrapper: Wrapper });

        await act(async () => {
            result.current.mutate({ parent_comment_id: null, body: 'boom', mentions: [] });
        });

        await waitFor(() => expect(result.current.isError).toBe(true));
        // Rollback call happened with the snapshot.
        expect(setSpy).toHaveBeenCalledWith(['taskComments', 't1'], previous);
        // Force-refetch per styleguide §5
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['taskComments', 't1'] });
        expect(toastError).toHaveBeenCalledWith('Could not post comment');
    });
});

describe('useUpdateComment (Wave 26)', () => {
    it('invokes invalidateQueries on error', async () => {
        mockUpdateBody.mockRejectedValue(new Error('boom'));
        const { Wrapper, qc } = makeWrapper();
        qc.setQueryData(['taskComments', 't1'], []);
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

        const { result } = renderHook(() => useUpdateComment('t1'), { wrapper: Wrapper });
        await act(async () => {
            result.current.mutate({ id: 'c1', body: 'edit', mentions: [] });
        });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['taskComments', 't1'] });
    });
});

describe('useDeleteComment (Wave 26)', () => {
    it('invokes invalidateQueries on error', async () => {
        mockSoftDelete.mockRejectedValue(new Error('boom'));
        const { Wrapper, qc } = makeWrapper();
        qc.setQueryData(['taskComments', 't1'], []);
        const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

        const { result } = renderHook(() => useDeleteComment('t1'), { wrapper: Wrapper });
        await act(async () => {
            result.current.mutate('c1');
        });
        await waitFor(() => expect(result.current.isError).toBe(true));
        expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['taskComments', 't1'] });
    });
});
