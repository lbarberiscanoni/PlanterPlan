import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { useAuth } from '@/shared/contexts/auth-context';
import { nowUtcIso } from '@/shared/lib/date-engine';
import type { TaskCommentWithAuthor } from '@/shared/db/app.types';

type CommentsCache = TaskCommentWithAuthor[];

type CreatePayload = {
    parent_comment_id?: string | null;
    body: string;
    mentions: string[];
};

type UpdatePayload = {
    id: string;
    body: string;
    mentions: string[];
};

/** Fetches all non-deleted comments for a task, oldest first, joined with author. */
export function useTaskComments(taskId: string | null) {
    return useQuery<CommentsCache>({
        queryKey: ['taskComments', taskId],
        queryFn: () => planter.entities.TaskComment.listByTask(taskId as string),
        enabled: !!taskId,
    });
}

/** Optimistic insert. Rollback + force-refetch on error per styleguide §5. */
export function useCreateComment(taskId: string) {
    const qc = useQueryClient();
    const { user } = useAuth();
    const key = ['taskComments', taskId];

    return useMutation({
        mutationFn: (payload: CreatePayload) => {
            if (!user) throw new Error('Cannot post a comment while signed out');
            return planter.entities.TaskComment.create({
                task_id: taskId,
                author_id: user.id,
                parent_comment_id: payload.parent_comment_id ?? null,
                body: payload.body,
                mentions: payload.mentions,
            });
        },
        onMutate: async (payload) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<CommentsCache>(key);
            if (user) {
                const now = nowUtcIso();
                const temp: TaskCommentWithAuthor = {
                    id: `optimistic-${globalThis.crypto.randomUUID()}`,
                    task_id: taskId,
                    root_id: taskId,
                    parent_comment_id: payload.parent_comment_id ?? null,
                    author_id: user.id,
                    body: payload.body,
                    mentions: payload.mentions,
                    created_at: now,
                    updated_at: now,
                    edited_at: null,
                    deleted_at: null,
                    author: {
                        id: user.id,
                        email: user.email,
                        user_metadata: user.user_metadata,
                    },
                };
                qc.setQueryData<CommentsCache>(key, (old = []) => [...old, temp]);
            }
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
            qc.invalidateQueries({ queryKey: key });
            toast.error('Could not post comment');
        },
        onSettled: () => qc.invalidateQueries({ queryKey: key }),
    });
}

/** Optimistic edit. Rollback + force-refetch on error per styleguide §5. */
export function useUpdateComment(taskId: string) {
    const qc = useQueryClient();
    const key = ['taskComments', taskId];

    return useMutation({
        mutationFn: (payload: UpdatePayload) =>
            planter.entities.TaskComment.updateBody(payload.id, {
                body: payload.body,
                mentions: payload.mentions,
            }),
        onMutate: async (payload) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<CommentsCache>(key);
            qc.setQueryData<CommentsCache>(key, (old = []) =>
                old.map((c) =>
                    c.id === payload.id
                        ? {
                              ...c,
                              body: payload.body,
                              mentions: payload.mentions,
                              edited_at: nowUtcIso(),
                          }
                        : c,
                ),
            );
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
            qc.invalidateQueries({ queryKey: key });
            toast.error('Could not update comment');
        },
        onSettled: () => qc.invalidateQueries({ queryKey: key }),
    });
}

/**
 * Optimistic soft-delete: marks `deleted_at` + blanks `body` in place so the
 * row survives and `CommentItem` renders a tombstone. Keeping the row means
 * replies whose parent was just deleted don't orphan off the thread.
 * Rollback + force-refetch on error per styleguide §5.
 */
export function useDeleteComment(taskId: string) {
    const qc = useQueryClient();
    const key = ['taskComments', taskId];

    return useMutation({
        mutationFn: (commentId: string) => planter.entities.TaskComment.softDelete(commentId),
        onMutate: async (commentId) => {
            await qc.cancelQueries({ queryKey: key });
            const previous = qc.getQueryData<CommentsCache>(key);
            const now = nowUtcIso();
            qc.setQueryData<CommentsCache>(key, (old = []) =>
                old.map((c) => (c.id === commentId ? { ...c, deleted_at: now, body: '' } : c)),
            );
            return { previous };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous !== undefined) qc.setQueryData(key, ctx.previous);
            qc.invalidateQueries({ queryKey: key });
            toast.error('Could not delete comment');
        },
        onSettled: () => qc.invalidateQueries({ queryKey: key }),
    });
}
