import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAdminUsers, useAdminUserDetail } from '@/features/admin/hooks/useAdminUsers';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import type { AdminListUsersFilter } from '@/shared/db/app.types';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';

/**
 * Wave 34 Task 2 — admin user-management table. Server-side filter via the
 * `admin_list_users` RPC (see `useAdminUsers`). A client-side search input
 * ANDs with the server filter for snappier typing (the RPC also supports
 * `filter.search`; here we set both to keep debounce trivial).
 *
 * Columns: Email / Display Name / Role / Last Sign In / Active Projects /
 *          Completed 30d / Overdue.
 * Clicking a row populates the right-side detail panel via
 * `useAdminUserDetail`. The URL param `:uid` pre-selects a user (used by
 * AdminSearch's "click a user → navigate to this page" flow).
 */
export default function AdminUsers() {
    const { uid: uidParam } = useParams<{ uid: string }>();
    const [filter, setFilter] = useState<AdminListUsersFilter>({
        role: 'all',
        lastLogin: 'all',
        hasOverdue: false,
        search: '',
    });
    const [selectedUid, setSelectedUid] = useState<string | null>(uidParam ?? null);
    const list = useAdminUsers(filter);
    const detail = useAdminUserDetail(selectedUid);

    // Keep the selection in sync with the URL param (deep-linking from
    // AdminSearch → /admin/users/:uid).
    const effectiveSelectedUid = useMemo(() => selectedUid ?? uidParam ?? null, [selectedUid, uidParam]);

    return (
        <div className="p-8" data-testid="admin-users">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Users</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Server-side filtered by role, last login, overdue status, or free-text search.
                </p>
            </header>

            <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="admin-users-filters">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Role</span>
                    <Select
                        value={filter.role ?? 'all'}
                        onValueChange={(v) =>
                            setFilter((f) => ({ ...f, role: v as AdminListUsersFilter['role'] }))
                        }
                    >
                        <SelectTrigger
                            className="w-36 bg-card"
                            aria-label="Filter by role"
                            data-testid="admin-users-filter-role"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="standard">Standard</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Last sign-in</span>
                    <Select
                        value={filter.lastLogin ?? 'all'}
                        onValueChange={(v) =>
                            setFilter((f) => ({ ...f, lastLogin: v as AdminListUsersFilter['lastLogin'] }))
                        }
                    >
                        <SelectTrigger
                            className="w-48 bg-card"
                            aria-label="Filter by last sign-in"
                            data-testid="admin-users-filter-lastLogin"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="last_7">Last 7 days</SelectItem>
                            <SelectItem value="last_30">Last 30 days</SelectItem>
                            <SelectItem value="inactive">30+ days inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!filter.hasOverdue}
                        onChange={(e) => setFilter((f) => ({ ...f, hasOverdue: e.target.checked }))}
                        data-testid="admin-users-filter-hasOverdue"
                    />
                    <span>Has overdue tasks</span>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Search
                    <input
                        type="search"
                        value={filter.search ?? ''}
                        onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                        placeholder="email or name"
                        className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                        data-testid="admin-users-filter-search"
                    />
                </label>
            </div>

            <div className="flex gap-6">
                <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <table className="w-full text-sm" data-testid="admin-users-table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold">Email</th>
                                <th className="px-4 py-2 text-left font-semibold">Name</th>
                                <th className="px-4 py-2 text-left font-semibold">Role</th>
                                <th className="px-4 py-2 text-left font-semibold">Last Sign-in</th>
                                <th className="px-4 py-2 text-right font-semibold">Projects</th>
                                <th className="px-4 py-2 text-right font-semibold">Completed (30d)</th>
                                <th className="px-4 py-2 text-right font-semibold">Overdue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">Loading…</td>
                                </tr>
                            ) : list.error ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-red-600">{list.error.message}</td>
                                </tr>
                            ) : (list.data ?? []).length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No users match.</td>
                                </tr>
                            ) : (
                                (list.data ?? []).map((u) => (
                                    <tr
                                        key={u.id}
                                        className={
                                            'cursor-pointer border-t border-border hover:bg-slate-50 ' +
                                            (effectiveSelectedUid === u.id ? 'bg-brand-50' : '')
                                        }
                                        onClick={() => setSelectedUid(u.id)}
                                        data-testid={`admin-users-row-${u.id}`}
                                    >
                                        <td className="px-4 py-2">{u.email}</td>
                                        <td className="px-4 py-2">{u.display_name}</td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={
                                                    u.is_admin
                                                        ? 'inline-flex rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700'
                                                        : 'inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700'
                                                }
                                            >
                                                {u.is_admin ? 'admin' : 'standard'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2">
                                            {u.last_sign_in_at ? formatDisplayDate(u.last_sign_in_at) : '—'}
                                        </td>
                                        <td className="px-4 py-2 text-right tabular-nums">{u.active_project_count}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{u.completed_tasks_30d}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{u.overdue_task_count}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {effectiveSelectedUid && (
                    <aside
                        className="w-80 flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm"
                        data-testid="admin-users-detail"
                    >
                        {detail.isLoading ? (
                            <p className="text-sm text-muted-foreground">Loading detail…</p>
                        ) : detail.error ? (
                            <p className="text-sm text-red-600">{detail.error.message}</p>
                        ) : !detail.data ? (
                            <p className="text-sm text-muted-foreground">User not found.</p>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-slate-900">{detail.data.profile.display_name}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">{detail.data.profile.email}</p>
                                <dl className="mt-4 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Role</dt>
                                        <dd>{detail.data.profile.is_admin ? 'admin' : 'standard'}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Projects</dt>
                                        <dd className="tabular-nums">{detail.data.projects.length}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Assigned tasks</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.assigned}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Completed (30d)</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.completed}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">Overdue</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.overdue}</dd>
                                    </div>
                                </dl>
                                {detail.data.projects.length > 0 && (
                                    <section className="mt-5">
                                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            Project memberships
                                        </h3>
                                        <ul className="space-y-1 text-sm">
                                            {detail.data.projects.map((p) => (
                                                <li key={p.project_id} className="flex justify-between gap-3">
                                                    <span className="truncate">{p.project_title ?? p.project_id}</span>
                                                    <span className="text-muted-foreground">{p.role}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}
                            </>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
}
