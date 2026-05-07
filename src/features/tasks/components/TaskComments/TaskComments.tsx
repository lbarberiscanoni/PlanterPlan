import { useAuth } from '@/shared/contexts/auth-context';
import {
    useTaskComments,
    useCreateComment,
    useUpdateComment,
    useDeleteComment,
} from '@/features/tasks/hooks/useTaskComments';
import { useTaskCommentsRealtime } from '@/features/tasks/hooks/useTaskCommentsRealtime';
import { CommentList } from './CommentList';
import { CommentComposer } from './CommentComposer';

interface TaskCommentsProps {
    taskId: string;
}

export default function TaskComments({ taskId }: TaskCommentsProps) {
    const { user } = useAuth();
    useTaskCommentsRealtime(taskId);
    const { data: comments = [], isLoading } = useTaskComments(taskId);
    const createComment = useCreateComment(taskId);
    const updateComment = useUpdateComment(taskId);
    const deleteComment = useDeleteComment(taskId);

    const handleTopLevelSubmit = (body: string, mentions: string[]) => {
        createComment.mutate({ parent_comment_id: null, body, mentions });
    };

    const handleReply = (parentCommentId: string, body: string, mentions: string[]) => {
        createComment.mutate({ parent_comment_id: parentCommentId, body, mentions });
    };

    const handleEdit = (commentId: string, body: string, mentions: string[]) => {
        updateComment.mutate({ id: commentId, body, mentions });
    };

    const handleDelete = (commentId: string) => {
        deleteComment.mutate(commentId);
    };

    const canPost = !!user;
    // Tombstones remain in the cache to preserve reply lineage but aren't
    // counted as "live" comments. Keep the full list for CommentList so the
    // thread structure stays intact.
    const liveCount = comments.reduce((n, c) => (c.deleted_at === null ? n + 1 : n), 0);
    const isEmpty = comments.length === 0;

    return (
        <div className="detail-section mb-6" data-testid="task-comments-section">
            <div className="flex items-baseline gap-2 mb-3">
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Comments</h3>
                <span className="text-sm text-slate-500" data-testid="task-comments-count">
                    {liveCount} {liveCount === 1 ? 'comment' : 'comments'}
                </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-4">
                {isLoading ? (
                    <p className="text-sm text-slate-500" data-testid="task-comments-loading">
                        Loading comments…
                    </p>
                ) : isEmpty ? (
                    <p className="text-sm text-slate-500" data-testid="task-comments-empty">
                        No comments yet — be the first to add one.
                    </p>
                ) : (
                    <CommentList
                        comments={comments}
                        currentUserId={user?.id ?? null}
                        onReply={handleReply}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                    />
                )}

                {canPost && (
                    <div className="pt-4 border-t border-slate-100">
                        <CommentComposer onSubmit={handleTopLevelSubmit} />
                    </div>
                )}
            </div>
        </div>
    );
}
