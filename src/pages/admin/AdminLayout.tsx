import { useEffect } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useIsAdmin } from '@/features/admin/hooks/useIsAdmin';
import { cn } from '@/shared/lib/utils';
import { LayoutDashboard, Users, BarChart3, FileStack } from 'lucide-react';

type AdminLabelKey =
    | 'admin.nav_home'
    | 'admin.nav_users'
    | 'admin.nav_analytics'
    | 'admin.nav_templates';

type NavItem = {
    to: string;
    labelKey: AdminLabelKey;
    testIdKey: string;
    icon: React.ComponentType<{ className?: string }>;
    end?: boolean;
};

// Wave 34 scope ships Home / Users / Analytics / Templates under /admin.
// A dedicated `/admin/projects` surface wasn't scoped; admins browse
// cross-tenant projects today via `/admin` search + per-project routes.
const NAV_ITEMS: NavItem[] = [
    { to: '/admin', labelKey: 'admin.nav_home', testIdKey: 'home', icon: LayoutDashboard, end: true },
    { to: '/admin/users', labelKey: 'admin.nav_users', testIdKey: 'users', icon: Users },
    { to: '/admin/analytics', labelKey: 'admin.nav_analytics', testIdKey: 'analytics', icon: BarChart3 },
    { to: '/admin/templates', labelKey: 'admin.nav_templates', testIdKey: 'templates', icon: FileStack },
];

/**
 * Wave 34: admin shell. Hard-gates every `/admin/*` route via `useIsAdmin`.
 * Non-admin users are redirected to `/dashboard` with a Sonner toast.
 * Nav on the left, `<Outlet>` renders the matched child route.
 *
 * Templates + Projects are shallow links into the existing routes, not new
 * screens — admins navigate there via this shell for discoverability.
 */
export default function AdminLayout() {
    const { t } = useTranslation();
    const { loading } = useAuth();
    const isAdmin = useIsAdmin();

    useEffect(() => {
        if (!loading && !isAdmin) {
            toast.error(t('admin.shell_access_required_toast'));
        }
    }, [loading, isAdmin, t]);

    if (loading) {
        return (
            <div className="p-8 text-sm text-muted-foreground" data-testid="admin-loading">
                {t('admin.shell_loading')}
            </div>
        );
    }

    if (!isAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="flex h-full w-full" data-testid="admin-layout">
            <aside
                className="w-64 flex-shrink-0 border-r border-border bg-card px-4 py-6"
                aria-label={t('admin.nav_aria')}
            >
                <h2 className="mb-6 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('admin.shell_title')}
                </h2>
                <nav className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.end}
                                className={({ isActive }) =>
                                    cn(
                                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                                        isActive
                                            ? 'bg-brand-50 text-brand-700'
                                            : 'text-slate-700 hover:bg-slate-100',
                                    )
                                }
                                data-testid={`admin-nav-${item.testIdKey}`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {t(item.labelKey)}
                            </NavLink>
                        );
                    })}
                </nav>
            </aside>
            <main className="flex-1 overflow-y-auto bg-background" data-testid="admin-main">
                <Outlet />
            </main>
        </div>
    );
}
