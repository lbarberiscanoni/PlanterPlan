import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { track } from '@/shared/analytics/posthog';
import type {
    NotificationPreferencesRow,
    NotificationPreferencesUpdate,
    NotificationLogRow,
} from '@/shared/db/app.types';

const PREFS_KEY = ['notificationPreferences'] as const;

export function useNotificationPreferences() {
    return useQuery<NotificationPreferencesRow>({
        queryKey: PREFS_KEY,
        queryFn: () => planter.notifications.getPreferences(),
    });
}

interface OptimisticContext {
    previous?: NotificationPreferencesRow;
}

export function useUpdateNotificationPreferences() {
    const qc = useQueryClient();
    return useMutation<NotificationPreferencesRow, Error, NotificationPreferencesUpdate, OptimisticContext>({
        mutationFn: (patch) => planter.notifications.updatePreferences(patch),
        onMutate: async (patch) => {
            await qc.cancelQueries({ queryKey: PREFS_KEY });
            const previous = qc.getQueryData<NotificationPreferencesRow>(PREFS_KEY);
            if (previous) {
                qc.setQueryData<NotificationPreferencesRow>(PREFS_KEY, { ...previous, ...patch } as NotificationPreferencesRow);
            }
            return { previous };
        },
        onSuccess: (_data, patch) => {
            // `channel` = which pref key(s) changed; `cadence` = overdue-digest
            // setting when that was the change. No values beyond enums/keys.
            const keys = Object.keys(patch).filter((k) => k !== 'user_id' && k !== 'updated_at');
            track('notification_pref_changed', {
                channel: keys.join(',') || 'unknown',
                cadence: typeof patch.email_overdue_digest === 'string' ? patch.email_overdue_digest : 'n/a',
            });
        },
        onError: (_err, _patch, ctx) => {
            if (ctx?.previous) qc.setQueryData(PREFS_KEY, ctx.previous);
            qc.invalidateQueries({ queryKey: PREFS_KEY });
            toast.error('Could not save preferences');
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: PREFS_KEY });
        },
    });
}

export function useNotificationLog(opts?: { limit?: number; before?: string; eventType?: string }) {
    return useQuery<NotificationLogRow[]>({
        queryKey: ['notificationLog', opts],
        queryFn: () => planter.notifications.listLog(opts),
    });
}
