import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import type { ActivityLogWithActor, UserMetadata } from '@/shared/db/app.types';

interface ActivityRowProps {
    row: ActivityLogWithActor;
    /** Hide the entity-link suffix on per-task rails where the entity is implicit. */
    hideEntityLink?: boolean;
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

function actorName(row: ActivityLogWithActor): string {
    if (!row.actor) return '';
    const meta = row.actor.user_metadata as UserMetadata | undefined;
    const fullName = typeof meta?.full_name === 'string' ? meta.full_name : null;
    if (fullName) return fullName;
    return row.actor.email;
}

function truncate(s: string | undefined | null, n: number): string {
    if (!s) return '';
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

function verbPhrase(row: ActivityLogWithActor, t: TFunction): string {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    switch (`${row.entity_type}.${row.action}`) {
        case 'task.created': {
            const title = typeof payload.title === 'string' ? payload.title : t('activity.fallback_task');
            return t('activity.task_created', { title: truncate(title, 80) });
        }
        case 'task.updated': {
            const keys = Array.isArray(payload.changed_keys) ? (payload.changed_keys as string[]) : [];
            return keys.length > 0
                ? t('activity.task_updated_keys', { keys: keys.join(', ') })
                : t('activity.task_updated');
        }
        case 'task.deleted': {
            const title = typeof payload.title === 'string' ? payload.title : t('activity.fallback_task');
            return t('activity.task_deleted', { title: truncate(title, 80) });
        }
        case 'task.status_changed': {
            const from = typeof payload.from === 'string' ? payload.from : t('errors.unknown');
            const to = typeof payload.to === 'string' ? payload.to : t('errors.unknown');
            return t('activity.task_status_changed', { from, to });
        }
        case 'comment.comment_posted':
            return payload.body_preview
                ? t('activity.comment_posted_preview', { preview: truncate(String(payload.body_preview), 100) })
                : t('activity.comment_posted');
        case 'comment.comment_edited':
            return payload.body_preview
                ? t('activity.comment_edited_preview', { preview: truncate(String(payload.body_preview), 100) })
                : t('activity.comment_edited');
        case 'comment.comment_deleted':
            return t('activity.comment_deleted');
        case 'member.member_added': {
            const role = typeof payload.role === 'string' ? payload.role : t('common.member');
            return t('activity.member_added', { role });
        }
        case 'member.member_removed': {
            const role = typeof payload.role === 'string' ? payload.role : t('common.member');
            return t('activity.member_removed', { role });
        }
        case 'member.member_role_changed': {
            const from = typeof payload.from === 'string' ? payload.from : t('errors.unknown');
            const to = typeof payload.to === 'string' ? payload.to : t('errors.unknown');
            return t('activity.member_role_changed', { from, to });
        }
        default:
            return t('activity.generic', { action: row.action, entityType: row.entity_type });
    }
}

export function ActivityRow({ row, hideEntityLink = false }: ActivityRowProps) {
    const { t } = useTranslation();
    const meta = row.actor?.user_metadata as UserMetadata | undefined;
    const fullName = typeof meta?.full_name === 'string' ? meta.full_name : null;
    const name = actorName(row) || t('activity.actor_unknown');

    return (
        <div
            className="flex items-start gap-3 py-2"
            data-testid={`activity-row-${row.id}`}
            data-activity-entity={row.entity_type}
        >
            <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-slate-100 text-slate-700 text-xs font-semibold">
                    {initials(row.actor?.email, fullName)}
                </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{name}</span>{' '}
                <span>{verbPhrase(row, t)}</span>
                {!hideEntityLink && (
                    <span className="text-slate-400 ml-1 text-xs">· {row.entity_type}</span>
                )}
                <div className="text-xs text-slate-400">
                    {formatDisplayDate(row.created_at)}
                </div>
            </div>
        </div>
    );
}
