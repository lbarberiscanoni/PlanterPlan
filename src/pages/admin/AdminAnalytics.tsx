import { useTranslation } from 'react-i18next';
import { useAdminAnalytics } from '@/features/admin/hooks/useAdminAnalytics';
import {
    BarChart,
    Bar,
    CartesianGrid,
    Legend,
    LineChart,
    Line,
    PieChart,
    Pie,
    Cell,
    ResponsiveContainer,
    Tooltip as RechartsTooltip,
    XAxis,
    YAxis,
} from 'recharts';

/**
 * Wave 34 Task 3 — analytics dashboard. Single RPC (admin_analytics_snapshot)
 * backs every chart. recharts is already in the bundle (Waves 19, 20, 28).
 */

// Chart fills route through the Tailwind CSS-variable palette (same
// convention as the Wave 29 PhaseCard donut). No raw hex.
const KIND_COLORS: Record<string, string> = {
    date: 'var(--color-brand-600)',
    checkpoint: 'var(--color-slate-400)',
};

const STATUS_COLORS: Record<string, string> = {
    todo: 'var(--color-slate-400)',
    not_started: 'var(--color-slate-300)',
    in_progress: 'var(--color-orange-500)',
    completed: 'var(--color-green-500)',
    blocked: 'var(--color-red-500)',
};

const CHART_GRID_STROKE = 'var(--color-slate-200)';

export default function AdminAnalytics() {
    const { t } = useTranslation();
    const { data, isLoading, error } = useAdminAnalytics();

    if (isLoading) {
        return (
            <div className="p-8 text-sm text-muted-foreground" data-testid="admin-analytics-loading">
                {t('admin.analytics_loading')}
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-8 text-sm text-red-600" data-testid="admin-analytics-error">
                {error.message}
            </div>
        );
    }

    if (!data) {
        return (
            <div className="p-8 text-sm text-muted-foreground" data-testid="admin-analytics-empty">
                {t('admin.analytics_no_data')}
            </div>
        );
    }

    return (
        <div className="p-8" data-testid="admin-analytics">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('admin.analytics_title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {t('admin.analytics_subtitle')}
                </p>
            </header>

            <section className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="admin-analytics-totals">
                <StatCard label={t('admin.analytics_totals_users')} value={data.totals.users} />
                <StatCard label={t('admin.analytics_totals_projects')} value={data.totals.projects} />
                <StatCard label={t('admin.analytics_totals_active_30d')} value={data.totals.active_projects_30d} />
                <StatCard label={t('admin.analytics_totals_new_users_30d')} value={data.totals.new_users_30d} />
            </section>

            <section className="mb-8" data-testid="admin-analytics-projects-chart">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('admin.analytics_new_projects_heading')}
                </h2>
                <div className="h-64 w-full rounded-lg border border-border bg-card p-4 shadow-sm">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.new_projects_per_week}>
                            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                            <XAxis dataKey="week_start" />
                            <YAxis allowDecimals={false} />
                            <RechartsTooltip />
                            <Line type="monotone" dataKey="count" stroke="var(--color-brand-600)" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-4 shadow-sm" data-testid="admin-analytics-kind-chart">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('admin.analytics_project_kind_heading')}
                    </h2>
                    <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={data.project_kind_breakdown}
                                    dataKey="count"
                                    nameKey="kind"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label
                                >
                                    {data.project_kind_breakdown.map((entry) => (
                                        <Cell
                                            key={entry.kind}
                                            fill={KIND_COLORS[entry.kind] ?? 'var(--color-slate-500)'}
                                        />
                                    ))}
                                </Pie>
                                <Legend />
                                <RechartsTooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-4 shadow-sm" data-testid="admin-analytics-status-chart">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('admin.analytics_task_status_heading')}
                    </h2>
                    <div className="h-56 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={data.task_status_breakdown}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                                <XAxis dataKey="status" />
                                <YAxis allowDecimals={false} />
                                <RechartsTooltip />
                                <Bar dataKey="count">
                                    {data.task_status_breakdown.map((entry) => (
                                        <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? 'var(--color-slate-500)'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
                <section className="rounded-lg border border-border bg-card p-4 shadow-sm" data-testid="admin-analytics-top-users">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('admin.analytics_top_users_heading')}
                    </h2>
                    {data.most_active_users.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('admin.analytics_no_data')}</p>
                    ) : (
                        <ul className="space-y-1 text-sm">
                            {data.most_active_users.map((u) => (
                                <li key={u.user_id} className="flex items-center justify-between gap-4">
                                    <span className="truncate">{u.display_name}</span>
                                    <span className="tabular-nums text-muted-foreground">{u.tasks_created_30d}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="rounded-lg border border-border bg-card p-4 shadow-sm" data-testid="admin-analytics-top-templates">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('admin.analytics_top_templates_heading')}
                    </h2>
                    {data.most_popular_templates.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('admin.analytics_no_data')}</p>
                    ) : (
                        <ul className="space-y-1 text-sm">
                            {data.most_popular_templates.map((tmpl) => (
                                <li key={tmpl.template_id} className="flex items-center justify-between gap-4">
                                    <span className="truncate">{tmpl.title}</span>
                                    <span className="tabular-nums text-muted-foreground">{tmpl.clone_count}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}

interface StatCardProps {
    label: string;
    value: number;
}

function StatCard({ label, value }: StatCardProps) {
    return (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
        </div>
    );
}
