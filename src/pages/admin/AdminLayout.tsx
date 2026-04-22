import { useEffect } from 'react';
import { NavLink, Navigate, Outlet } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/shared/contexts/AuthContext';
import { useIsAdmin } from '@/features/admin/hooks/useIsAdmin';
import { cn } from '@/shared/lib/utils';
import { LayoutDashboard, Users, BarChart3, FileStack } from 'lucide-react';

// Wave 34 scope ships Home / Users / Analytics / Templates under /admin.
// A dedicated `/admin/projects` surface wasn't scoped; admins browse
// cross-tenant projects today via `/admin` search + per-project routes.
const NAV_ITEMS: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }>; end?: boolean }> = [
    { to: '/admin', label: 'Home', icon: LayoutDashboard, end: true },
    { to: '/admin/users', label: 'Users', icon: Users },
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/admin/templates', label: 'Templates', icon: FileStack },
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
    const { loading } = useAuth();
    const isAdmin = useIsAdmin();

    useEffect(() => {
        if (!loading && !isAdmin) {
            toast.error('You need admin access for this page.');
        }
    }, [loading, isAdmin]);

    if (loading) {
        return (
            <div className="p-8 text-sm text-muted-foreground" data-testid="admin-loading">
                Loading admin shell…
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
                aria-label="Admin navigation"
            >
                <h2 className="mb-6 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Admin
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
                                data-testid={`admin-nav-${item.label.toLowerCase()}`}
                            >
                                <Icon className="h-4 w-4" />
                                {item.label}
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
