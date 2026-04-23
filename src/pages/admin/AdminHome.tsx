import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { planter } from '@/shared/api/planterClient';
import AdminSearch from '@/pages/admin/components/AdminSearch';
import type { AdminActivityRow } from '@/shared/db/app.types';
import { formatDisplayDate } from '@/shared/lib/date-engine';

/**
 * Admin home: global search header + cross-project recent activity feed.
 * Activity is fetched through the SECURITY DEFINER `admin_recent_activity`
 * RPC so one query returns a hydrated feed across every project. (The Wave 27
 * activity_log RLS already grants admins SELECT via an `is_admin` OR clause,
 * so the RPC is redundant-but-harmless; we route through it for a single
 * hydrated source of actor_email.)
 */
export default function AdminHome() {
    const { t } = useTranslation();
    const activity = useQuery<AdminActivityRow[]>({
        queryKey: ['adminRecentActivity'],
        queryFn: () => planter.admin.recentActivity(50),
    });

    return (
        <div className="p-8" data-testid="admin-home">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('admin.home_title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('admin.home_subtitle')}</p>
            </header>
            <AdminSearch />

            <section className="mt-10" data-testid="admin-home-activity">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('admin.recent_activity_heading')}
                </h2>
                {activity.isLoading ? (
                    <p className="text-sm text-muted-foreground">{t('admin.loading')}</p>
                ) : activity.error instanceof Error ? (
                    <p className="text-sm text-red-600">{activity.error.message}</p>
                ) : (activity.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('admin.no_activity')}</p>
                ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border bg-card shadow-sm">
                        {(activity.data ?? []).slice(0, 20).map((row) => (
                            <li key={row.id} className="flex items-start justify-between gap-4 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-slate-900">
                                        <span>{row.action}</span>
                                        <span className="text-muted-foreground"> {t('admin.activity_on')} </span>
                                        <span>{row.entity_type}</span>
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                        {row.actor_email ?? t('admin.activity_actor_system')} · project {row.project_id ?? t('admin.activity_project_none')}
                                    </p>
                                </div>
                                <span className="flex-shrink-0 text-xs text-muted-foreground">
                                    {formatDisplayDate(row.created_at)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}
