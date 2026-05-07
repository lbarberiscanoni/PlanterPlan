import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeCommentWithAuthor } from '@test';
import type { TaskCommentWithAuthor } from '@/shared/db/app.types';

const mockUseTaskComments = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();

// Wave 30: CommentComposer transitively imports `planter` from planterClient
// (for `resolveMentions` → `planter.rpc`). The planterClient module throws at
// import time when VITE_SUPABASE_URL is unset, so the whole test file fails
// to load without this stub. The error path now warns and returns no mentions,
// which keeps these rendering-focused assertions independent of notification
// delivery.
vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('mocked rpc') }),
    },
}));

vi.mock('@/features/tasks/hooks/useTaskComments', () => ({
    useTaskComments: (...args: unknown[]) => mockUseTaskComments(...args),
    useCreateComment: () => ({ mutate: mockCreateMutate, isPending: false }),
    useUpdateComment: () => ({ mutate: mockUpdateMutate, isPending: false }),
    useDeleteComment: () => ({ mutate: mockDeleteMutate, isPending: false }),
}));

vi.mock('@/features/tasks/hooks/useTaskCommentsRealtime', () => ({
    useTaskCommentsRealtime: () => undefined,
}));

vi.mock('@/shared/contexts/auth-context', () => ({
    useAuth: () => ({
        user: {
            id: 'user-me',
            email: 'me@example.com',
            user_metadata: { full_name: 'Me' },
        },
    }),
}));

import TaskComments from '@/features/tasks/components/TaskComments/TaskComments';

function renderSut(taskId = 'task-1') {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return render(
        <QueryClientProvider client={qc}>
            <TaskComments taskId={taskId} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockUseTaskComments.mockReturnValue({ data: [], isLoading: false });
});

describe('TaskComments (Wave 26)', () => {
    it('renders the empty-state copy when there are no comments', () => {
        renderSut();
        expect(screen.getByTestId('task-comments-empty')).toHaveTextContent(
            /no comments yet — be the first to add one\./i,
        );
    });

    it('renders the comment count chip (0 comments when empty, singular vs plural)', () => {
        mockUseTaskComments.mockReturnValue({ data: [], isLoading: false });
        const { rerender } = renderSut();
        expect(screen.getByTestId('task-comments-count')).toHaveTextContent('0 comments');

        const one = [makeCommentWithAuthor({ task_id: 'task-1' })];
        mockUseTaskComments.mockReturnValue({ data: one, isLoading: false });
        rerender(
            <QueryClientProvider client={new QueryClient()}>
                <TaskComments taskId="task-1" />
            </QueryClientProvider>,
        );
        expect(screen.getByTestId('task-comments-count')).toHaveTextContent('1 comment');
    });

    it('groups top-level comments with replies underneath', () => {
        const top = makeCommentWithAuthor({
            id: 'top-1',
            task_id: 'task-1',
            parent_comment_id: null,
            body: 'Top comment',
        });
        const reply = makeCommentWithAuthor({
            id: 'reply-1',
            task_id: 'task-1',
            parent_comment_id: 'top-1',
            body: 'Nice reply',
        });
        mockUseTaskComments.mockReturnValue({ data: [top, reply], isLoading: false });

        renderSut();

        expect(screen.getByTestId('comment-top-1')).toHaveTextContent('Top comment');
        expect(screen.getByTestId('replies-top-1')).toBeInTheDocument();
        expect(screen.getByTestId('comment-reply-1')).toHaveTextContent('Nice reply');
        // Reply lives inside the replies container (chain-lift to depth-1).
        const repliesContainer = screen.getByTestId('replies-top-1');
        expect(repliesContainer).toContainElement(screen.getByTestId('comment-reply-1'));
    });

    it('renders a reply-to-reply at depth-1 with the in-reply-to chip pointing at the immediate parent', () => {
        const replyAuthor = {
            id: 'user-reply',
            email: 'replyguy@example.com',
            user_metadata: {},
        };
        const top: TaskCommentWithAuthor = makeCommentWithAuthor({
            id: 'top-1',
            task_id: 'task-1',
            parent_comment_id: null,
            body: 'Top',
        });
        const reply: TaskCommentWithAuthor = {
            ...makeCommentWithAuthor({
                id: 'reply-1',
                task_id: 'task-1',
                parent_comment_id: 'top-1',
                body: 'First reply',
            }),
            author: replyAuthor,
        };
        const replyToReply: TaskCommentWithAuthor = makeCommentWithAuthor({
            id: 'reply-to-reply-1',
            task_id: 'task-1',
            parent_comment_id: 'reply-1',
            body: 'Nested reply',
        });
        mockUseTaskComments.mockReturnValue({
            data: [top, reply, replyToReply],
            isLoading: false,
        });

        renderSut();

        // The depth-2 reply is lifted into the same replies container as depth-1.
        const replies = screen.getByTestId('replies-top-1');
        expect(replies).toContainElement(screen.getByTestId('comment-reply-to-reply-1'));

        // The reply-to-reply shows a chip pointing at its immediate parent (replyguy).
        const nestedItem = screen.getByTestId('comment-reply-to-reply-1');
        const chip = nestedItem.querySelector('[data-testid="comment-in-reply-to-chip"]');
        expect(chip).not.toBeNull();
        expect(chip?.textContent).toContain('@replyguy');
    });

    it('shows edit/delete affordances only on comments the current user owns', () => {
        const mine = makeCommentWithAuthor({
            id: 'mine',
            task_id: 'task-1',
            parent_comment_id: null,
            author_id: 'user-me',
            body: 'My comment',
        });
        const theirs = makeCommentWithAuthor({
            id: 'theirs',
            task_id: 'task-1',
            parent_comment_id: null,
            author_id: 'someone-else',
            body: 'Not mine',
        });
        mockUseTaskComments.mockReturnValue({ data: [mine, theirs], isLoading: false });

        renderSut();

        const mineRow = screen.getByTestId('comment-mine');
        const theirsRow = screen.getByTestId('comment-theirs');
        expect(mineRow.querySelector('[data-testid="comment-edit-btn"]')).not.toBeNull();
        expect(mineRow.querySelector('[data-testid="comment-delete-btn"]')).not.toBeNull();
        expect(theirsRow.querySelector('[data-testid="comment-edit-btn"]')).toBeNull();
        expect(theirsRow.querySelector('[data-testid="comment-delete-btn"]')).toBeNull();
    });

    it('does not show a composer when the viewer is signed out', async () => {
        vi.resetModules();
        vi.doMock('@/shared/contexts/auth-context', () => ({
            useAuth: () => ({ user: null }),
        }));
        vi.doMock('@/features/tasks/hooks/useTaskComments', () => ({
            useTaskComments: () => ({ data: [], isLoading: false }),
            useCreateComment: () => ({ mutate: vi.fn(), isPending: false }),
            useUpdateComment: () => ({ mutate: vi.fn(), isPending: false }),
            useDeleteComment: () => ({ mutate: vi.fn(), isPending: false }),
        }));
        vi.doMock('@/features/tasks/hooks/useTaskCommentsRealtime', () => ({
            useTaskCommentsRealtime: () => undefined,
        }));
        const { default: SignedOutTaskComments } = await import(
            '@/features/tasks/components/TaskComments/TaskComments'
        );
        const qc = new QueryClient();
        const { queryByTestId } = render(
            <QueryClientProvider client={qc}>
                <SignedOutTaskComments taskId="task-1" />
            </QueryClientProvider>,
        );
        expect(queryByTestId('comment-composer-textarea')).toBeNull();
    });

    it('renders a tombstone for soft-deleted comments (no body, no affordances) — keeps thread lineage intact', () => {
        const mineLive = makeCommentWithAuthor({
            id: 'live-1',
            task_id: 'task-1',
            parent_comment_id: null,
            author_id: 'user-me',
            body: 'Alive comment',
        });
        const deletedParent = makeCommentWithAuthor({
            id: 'deleted-parent',
            task_id: 'task-1',
            parent_comment_id: null,
            author_id: 'user-me',
            body: '',
            deleted_at: '2026-04-18T10:00:00.000Z',
        });
        const replyUnderDeleted = makeCommentWithAuthor({
            id: 'reply-under-deleted',
            task_id: 'task-1',
            parent_comment_id: 'deleted-parent',
            author_id: 'someone-else',
            body: 'Still visible reply',
        });
        mockUseTaskComments.mockReturnValue({
            data: [mineLive, deletedParent, replyUnderDeleted],
            isLoading: false,
        });

        renderSut();

        // Deleted parent renders a tombstone, no body, no edit/delete/reply.
        const deletedRow = screen.getByTestId('comment-deleted-parent');
        expect(deletedRow.querySelector('[data-testid="comment-tombstone"]')).not.toBeNull();
        expect(deletedRow).not.toHaveTextContent('Alive comment'); // sanity — not the wrong row
        expect(deletedRow.querySelector('[data-testid="comment-edit-btn"]')).toBeNull();
        expect(deletedRow.querySelector('[data-testid="comment-delete-btn"]')).toBeNull();
        expect(deletedRow.querySelector('[data-testid="comment-reply-btn"]')).toBeNull();

        // Reply under the deleted parent still renders — thread lineage preserved.
        expect(screen.getByTestId('comment-reply-under-deleted')).toHaveTextContent('Still visible reply');

        // Count chip shows live count (2 = mineLive + replyUnderDeleted), not 3.
        expect(screen.getByTestId('task-comments-count')).toHaveTextContent('2 comments');
    });

    it('renders deleted-account authors as historical comments without owner affordances', () => {
        const deletedAuthor = makeCommentWithAuthor({
            id: 'deleted-author',
            task_id: 'task-1',
            parent_comment_id: null,
            author_id: null,
            author: null,
            body: 'Historical comment remains',
        });
        mockUseTaskComments.mockReturnValue({ data: [deletedAuthor], isLoading: false });

        renderSut();

        const row = screen.getByTestId('comment-deleted-author');
        expect(row).toHaveTextContent('Deleted user');
        expect(row).toHaveTextContent('Historical comment remains');
        expect(row.querySelector('[data-testid="comment-edit-btn"]')).toBeNull();
        expect(row.querySelector('[data-testid="comment-delete-btn"]')).toBeNull();
    });
});
