import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Reply } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import type { TaskCommentWithAuthor } from '@/shared/db/app.types';
import { CommentComposer } from './CommentComposer';

interface CommentItemProps {
    comment: TaskCommentWithAuthor;
    currentUserId: string | null;
    inReplyToAuthor?: string | null;
    onReply: (parentCommentId: string, body: string, mentions: string[]) => void;
    onEdit: (commentId: string, body: string, mentions: string[]) => void;
    onDelete: (commentId: string) => void;
}

function initials(email: string | undefined | null, fullName: string | undefined | null): string {
    if (fullName) {
        const parts = fullName.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
    }
    if (email) return email.slice(0, 2).toUpperCase();
    return '??';
}

export function CommentItem({
    comment,
    currentUserId,
    inReplyToAuthor,
    onReply,
    onEdit,
    onDelete,
}: CommentItemProps) {
    const { t } = useTranslation();
    const [mode, setMode] = useState<'view' | 'edit' | 'reply'>('view');
    const isOwn = currentUserId !== null && comment.author_id === currentUserId;
    const isDeleted = comment.deleted_at !== null;
    const fullName =
        typeof comment.author?.user_metadata?.full_name === 'string'
            ? comment.author.user_metadata.full_name
            : null;
    const displayName = fullName || comment.author?.email || (
        comment.author_id === null
            ? t('tasks.comments.deleted_author')
            : t('common.unknown_name')
    );

    // Tombstone render — preserves thread lineage for replies without leaking
    // the original body (softDelete blanks it server-side; optimistic update
    // mirrors locally). No edit/delete/reply affordances.
    if (isDeleted) {
        return (
            <div className="flex gap-3 opacity-70" data-testid={`comment-${comment.id}`}>
                <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="bg-slate-100 text-slate-400 text-xs font-semibold">
                        {initials(comment.author?.email, fullName)}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-500 italic">{displayName}</span>
                        {inReplyToAuthor && (
                            <span
                                className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
                                data-testid="comment-in-reply-to-chip"
                            >
                                ↪ in reply to @{inReplyToAuthor}
                            </span>
                        )}
                    </div>
                    <p
                        className="mt-1 text-sm text-slate-400 italic"
                        data-testid="comment-tombstone"
                    >
                        This comment was deleted.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex gap-3" data-testid={`comment-${comment.id}`}>
            <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
                    {initials(comment.author?.email, fullName)}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{displayName}</span>
                    <span className="text-xs text-slate-500">{formatDisplayDate(comment.created_at)}</span>
                    {comment.edited_at && (
                        <span className="text-xs text-slate-400" data-testid="comment-edited-suffix">
                            (edited)
                        </span>
                    )}
                    {inReplyToAuthor && (
                        <span
                            className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5"
                            data-testid="comment-in-reply-to-chip"
                        >
                            ↪ in reply to @{inReplyToAuthor}
                        </span>
                    )}
                </div>

                {mode === 'edit' ? (
                    <CommentComposer
                        initialBody={comment.body}
                        submitLabel="Save"
                        onSubmit={(body, mentions) => {
                            onEdit(comment.id, body, mentions);
                            setMode('view');
                        }}
                        onCancel={() => setMode('view')}
                    />
                ) : (
                    <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{comment.body}</p>
                )}

                {mode === 'view' && (
                    <div className="mt-2 flex gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setMode('reply')}
                            data-testid="comment-reply-btn"
                            className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                        >
                            <Reply className="h-3 w-3 mr-1" /> {t('tasks.comments.reply_button')}
                        </Button>
                        {isOwn && (
                            <>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setMode('edit')}
                                    data-testid="comment-edit-btn"
                                    className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                                >
                                    <Pencil className="h-3 w-3 mr-1" /> {t('common.edit')}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onDelete(comment.id)}
                                    data-testid="comment-delete-btn"
                                    className="h-7 px-2 text-xs text-slate-500 hover:text-rose-600"
                                >
                                    <Trash2 className="h-3 w-3 mr-1" /> {t('common.delete')}
                                </Button>
                            </>
                        )}
                    </div>
                )}

                {mode === 'reply' && (
                    <div className="mt-3">
                        <CommentComposer
                            submitLabel="Reply"
                            onSubmit={(body, mentions) => {
                                onReply(comment.id, body, mentions);
                                setMode('view');
                            }}
                            onCancel={() => setMode('view')}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
