import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Shield, ShieldOff, Ban, KeyRound, CheckCircle2 } from 'lucide-react';
import { useAdminUsers, useAdminUserDetail } from '@/features/admin/hooks/useAdminUsers';
import { useAuth } from '@/shared/contexts/AuthContext';
import { formatDisplayDate, getNow, isBeforeDate } from '@/shared/lib/date-engine';
import { planter } from '@/shared/api/planterClient';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import type { AdminListUserRow, AdminListUsersFilter } from '@/shared/db/app.types';
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
const PAGE_SIZE = 50;

type SortKey =
    | 'email'
    | 'display_name'
    | 'is_admin'
    | 'last_sign_in_at'
    | 'active_project_count'
    | 'completed_tasks_30d'
    | 'overdue_task_count';
type SortDir = 'asc' | 'desc';

export default function AdminUsers() {
    const { t } = useTranslation();
    const { uid: uidParam } = useParams<{ uid: string }>();
    const [filter, setFilter] = useState<AdminListUsersFilter>({
        role: 'all',
        lastLogin: 'all',
        hasOverdue: false,
        search: '',
    });
    // Paginate via the RPC's existing limit/offset params — previously unused.
    const [page, setPage] = useState(0);
    // Client-side column sort. The `admin_list_users` RPC doesn't take a
    // sort param yet, so this sorts the current page's ≤50 rows. Server-
    // side sort would need an RPC signature change; tracked for a future
    // wave if user feedback demands it.
    const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
    const [selectedUid, setSelectedUid] = useState<string | null>(uidParam ?? null);
    const list = useAdminUsers(filter, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    const detail = useAdminUserDetail(selectedUid);

    // Snapshot "now" at mount via `getNow()` (date-engine wrapper around
    // `new Date()`). Lazy-initialized `useState` ensures the call runs
    // once on mount, not during every render — avoids the
    // react-hooks/impure-function lint. Moderation is a short-lived
    // view; if the admin lingers long enough that the snapshot goes
    // stale, selecting a different user refetches + refreshes.
    const [nowSnapshot] = useState(() => getNow());
    // `isBeforeDate(a, b)` returns true when `a` is strictly before `b`.
    // Currently suspended = nowSnapshot is before banned_until.
    const currentlySuspended = useMemo(() => {
        const bannedUntil = detail.data?.profile.banned_until;
        if (!bannedUntil) return false;
        return isBeforeDate(nowSnapshot, bannedUntil);
    }, [detail.data?.profile.banned_until, nowSnapshot]);

    // Reset to page 0 on any filter change.
    const setFilterAndResetPage: typeof setFilter = (next) => {
        setPage(0);
        setFilter(next);
    };

    const toggleSort = (key: SortKey) => {
        setSort((prev) => {
            if (!prev || prev.key !== key) return { key, dir: 'asc' };
            if (prev.dir === 'asc') return { key, dir: 'desc' };
            return null; // third click clears the sort
        });
    };

    const sortedRows = useMemo<AdminListUserRow[]>(() => {
        const rows = list.data ?? [];
        if (!sort) return rows;
        const { key, dir } = sort;
        const mul = dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            const av = a[key];
            const bv = b[key];
            // Push nulls to the end regardless of direction — matches the
            // "—" placeholder the UI shows for missing values.
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
            return String(av).localeCompare(String(bv)) * mul;
        });
    }, [list.data, sort]);

    const ariaSortFor = (key: SortKey): 'ascending' | 'descending' | 'none' => {
        if (!sort || sort.key !== key) return 'none';
        return sort.dir === 'asc' ? 'ascending' : 'descending';
    };

    // Toggle a user's platform-admin flag. Gated server-side by
    // `is_admin(auth.uid())`; self-demotion raises a specific error the
    // UI surfaces as a toast. Invalidates both the list and the detail
    // queries on success so the UI reflects the change immediately.
    const { user: currentUser } = useAuth();
    const confirm = useConfirm();
    const queryClient = useQueryClient();
    const toggleAdminMutation = useMutation({
        mutationFn: ({ uid, makeAdmin }: { uid: string; makeAdmin: boolean }) =>
            planter.admin.setAdminRole(uid, makeAdmin),
        onSuccess: (_data, vars) => {
            toast.success(
                vars.makeAdmin
                    ? t('admin.users_grant_admin_success_toast')
                    : t('admin.users_revoke_admin_success_toast'),
            );
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            queryClient.invalidateQueries({ queryKey: ['adminUserDetail', vars.uid] });
        },
        onError: (err: Error) => {
            toast.error(t('admin.users_role_change_failed_toast'), { description: err.message });
        },
    });

    const handleToggleAdmin = async (uid: string, currentIsAdmin: boolean) => {
        const makeAdmin = !currentIsAdmin;
        const ok = await confirm({
            title: makeAdmin
                ? t('admin.users_grant_admin_confirm_title')
                : t('admin.users_revoke_admin_confirm_title'),
            description: makeAdmin
                ? t('admin.users_grant_admin_confirm_description')
                : t('admin.users_revoke_admin_confirm_description'),
            confirmText: makeAdmin
                ? t('admin.users_grant_admin_confirm_button')
                : t('admin.users_revoke_admin_confirm_button'),
            destructive: !makeAdmin,
        });
        if (!ok) return;
        toggleAdminMutation.mutate({ uid, makeAdmin });
    };

    // Suspend / unsuspend — routes through the `admin-user-moderation` edge
    // function which handles the auth API call. Indefinite-duration by
    // default; the UI doesn't surface a duration picker in this pass.
    const suspensionMutation = useMutation({
        mutationFn: ({ uid, action }: { uid: string; action: 'suspend' | 'unsuspend' }) =>
            action === 'suspend'
                ? planter.admin.suspendUser(uid)
                : planter.admin.unsuspendUser(uid),
        onSuccess: (_data, vars) => {
            toast.success(
                vars.action === 'suspend'
                    ? t('admin.users_suspend_success_toast')
                    : t('admin.users_unsuspend_success_toast'),
            );
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            queryClient.invalidateQueries({ queryKey: ['adminUserDetail', vars.uid] });
        },
        onError: (err: Error) => {
            toast.error(t('admin.users_suspend_failed_toast'), { description: err.message });
        },
    });

    const handleToggleSuspension = async (uid: string, currentlySuspended: boolean) => {
        const action = currentlySuspended ? 'unsuspend' : 'suspend';
        const ok = await confirm({
            title: action === 'suspend'
                ? t('admin.users_suspend_confirm_title')
                : t('admin.users_unsuspend_confirm_title'),
            description: action === 'suspend'
                ? t('admin.users_suspend_confirm_description')
                : t('admin.users_unsuspend_confirm_description'),
            confirmText: action === 'suspend'
                ? t('admin.users_suspend_confirm_button')
                : t('admin.users_unsuspend_confirm_button'),
            destructive: action === 'suspend',
        });
        if (!ok) return;
        suspensionMutation.mutate({ uid, action });
    };

    // Password reset — generate a recovery link and copy it to clipboard.
    // The admin shares it out-of-band; Supabase does NOT auto-send an
    // email from this flow, which is intentional (admin-driven reset
    // vs. user-initiated forgot-password).
    const resetPasswordMutation = useMutation({
        mutationFn: (uid: string) => planter.admin.generatePasswordResetLink(uid),
        onSuccess: async (link) => {
            try {
                await navigator.clipboard.writeText(link);
                toast.success(t('admin.users_reset_password_copied_toast'));
            } catch {
                // Clipboard may be blocked (http://, iframe). Fall back
                // to showing the link in the toast so the admin can
                // copy it manually.
                toast.success(t('admin.users_reset_password_manual_toast'), {
                    description: link,
                    duration: 30_000,
                });
            }
        },
        onError: (err: Error) => {
            toast.error(t('admin.users_reset_password_failed_toast'), { description: err.message });
        },
    });

    const handleResetPassword = async (uid: string, displayName: string) => {
        const ok = await confirm({
            title: t('admin.users_reset_password_confirm_title'),
            description: t('admin.users_reset_password_confirm_description', { name: displayName }),
            confirmText: t('admin.users_reset_password_confirm_button'),
        });
        if (!ok) return;
        resetPasswordMutation.mutate(uid);
    };

    // Keep the selection in sync with the URL param (deep-linking from
    // AdminSearch → /admin/users/:uid).
    const effectiveSelectedUid = useMemo(() => selectedUid ?? uidParam ?? null, [selectedUid, uidParam]);

    return (
        <div className="p-8" data-testid="admin-users">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('admin.users_title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('admin.users_subtitle')}</p>
            </header>

            <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="admin-users-filters">
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t('admin.users_filter_role')}</span>
                    <Select
                        value={filter.role ?? 'all'}
                        onValueChange={(v) =>
                            setFilterAndResetPage((f) => ({ ...f, role: v as AdminListUsersFilter['role'] }))
                        }
                    >
                        <SelectTrigger
                            className="w-36 bg-card"
                            aria-label={t('admin.users_filter_role_aria')}
                            data-testid="admin-users-filter-role"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.users_filter_all')}</SelectItem>
                            <SelectItem value="admin">{t('admin.users_filter_admin')}</SelectItem>
                            <SelectItem value="standard">{t('admin.users_filter_standard')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">{t('admin.users_filter_last_signin')}</span>
                    <Select
                        value={filter.lastLogin ?? 'all'}
                        onValueChange={(v) =>
                            setFilterAndResetPage((f) => ({ ...f, lastLogin: v as AdminListUsersFilter['lastLogin'] }))
                        }
                    >
                        <SelectTrigger
                            className="w-48 bg-card"
                            aria-label={t('admin.users_filter_last_signin_aria')}
                            data-testid="admin-users-filter-lastLogin"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.users_filter_all')}</SelectItem>
                            <SelectItem value="last_7">{t('admin.users_filter_last_7')}</SelectItem>
                            <SelectItem value="last_30">{t('admin.users_filter_last_30')}</SelectItem>
                            <SelectItem value="inactive">{t('admin.users_filter_inactive')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <input
                        type="checkbox"
                        checked={!!filter.hasOverdue}
                        onChange={(e) => setFilterAndResetPage((f) => ({ ...f, hasOverdue: e.target.checked }))}
                        data-testid="admin-users-filter-hasOverdue"
                    />
                    <span>{t('admin.users_filter_overdue')}</span>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {t('admin.users_filter_search')}
                    <input
                        type="search"
                        value={filter.search ?? ''}
                        onChange={(e) => setFilterAndResetPage((f) => ({ ...f, search: e.target.value }))}
                        placeholder={t('admin.users_filter_search_placeholder')}
                        className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                        data-testid="admin-users-filter-search"
                    />
                </label>
            </div>

            <div className="flex gap-6">
                <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="admin-users-table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <SortableTh label={t('admin.users_col_email')} sortKey="email" align="left" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('email')} />
                                <SortableTh label={t('admin.users_col_name')} sortKey="display_name" align="left" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('display_name')} />
                                <SortableTh label={t('admin.users_col_role')} sortKey="is_admin" align="left" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('is_admin')} />
                                <SortableTh label={t('admin.users_col_last_signin')} sortKey="last_sign_in_at" align="left" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('last_sign_in_at')} />
                                <SortableTh label={t('admin.users_col_projects')} sortKey="active_project_count" align="right" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('active_project_count')} />
                                <SortableTh label={t('admin.users_col_completed_30d')} sortKey="completed_tasks_30d" align="right" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('completed_tasks_30d')} />
                                <SortableTh label={t('admin.users_col_overdue')} sortKey="overdue_task_count" align="right" sort={sort} onToggle={toggleSort} ariaSort={ariaSortFor('overdue_task_count')} />
                            </tr>
                        </thead>
                        <tbody>
                            {list.isLoading ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{t('admin.loading')}</td>
                                </tr>
                            ) : list.error ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-red-600">{list.error.message}</td>
                                </tr>
                            ) : sortedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{t('admin.users_no_match')}</td>
                                </tr>
                            ) : (
                                sortedRows.map((u) => (
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
                                                {u.is_admin ? t('admin.users_role_admin') : t('admin.users_role_standard')}
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

                    {/* Pagination controls. `admin_list_users` doesn't return a
                      * total count; we infer "has next page" from whether the
                      * current page is full (len === PAGE_SIZE). Not perfect
                      * on boundary cases — a page of exactly 50 rows shows an
                      * enabled Next that fetches an empty page — but cheaper
                      * than adding a separate count RPC and the user is
                      * immediately visually informed of the empty page. */}
                    <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-sm">
                        <span className="text-muted-foreground" data-testid="admin-users-page-info">
                            {list.data && list.data.length > 0
                                ? t('admin.users_showing_range', { start: page * PAGE_SIZE + 1, end: page * PAGE_SIZE + list.data.length })
                                : t('admin.users_no_results')}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                className="rounded border border-border bg-card px-3 py-1 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                                disabled={page === 0 || list.isLoading}
                                aria-label={t('admin.users_prev_page')}
                                data-testid="admin-users-prev-page"
                            >
                                ← {t('common.back')}
                            </button>
                            <span className="tabular-nums text-muted-foreground">{t('admin.users_page_label', { page: page + 1 })}</span>
                            <button
                                type="button"
                                className="rounded border border-border bg-card px-3 py-1 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => setPage((p) => p + 1)}
                                disabled={list.isLoading || !list.data || list.data.length < PAGE_SIZE}
                                aria-label={t('admin.users_next_page')}
                                data-testid="admin-users-next-page"
                            >
                                {t('common.next')} →
                            </button>
                        </div>
                    </div>
                </div>

                {effectiveSelectedUid && (
                    <aside
                        className="w-80 flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm"
                        data-testid="admin-users-detail"
                    >
                        {detail.isLoading ? (
                            <p className="text-sm text-muted-foreground">{t('admin.users_detail_loading')}</p>
                        ) : detail.error ? (
                            <p className="text-sm text-red-600">{detail.error.message}</p>
                        ) : !detail.data ? (
                            <p className="text-sm text-muted-foreground">{t('admin.users_detail_not_found')}</p>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-slate-900">{detail.data.profile.display_name}</h2>
                                <p className="mt-1 text-xs text-muted-foreground">{detail.data.profile.email}</p>
                                {currentlySuspended && (
                                    <p
                                        className="mt-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                                        data-testid="admin-users-suspended-badge"
                                        role="status"
                                    >
                                        <Ban aria-hidden="true" className="h-3 w-3" />
                                        {t('admin.users_suspended_badge')}
                                    </p>
                                )}
                                <dl className="mt-4 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('admin.users_col_role')}</dt>
                                        <dd>{detail.data.profile.is_admin ? t('admin.users_role_admin') : t('admin.users_role_standard')}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('admin.users_col_projects')}</dt>
                                        <dd className="tabular-nums">{detail.data.projects.length}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('admin.users_detail_assigned')}</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.assigned}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('admin.users_col_completed_30d')}</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.completed}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-muted-foreground">{t('admin.users_col_overdue')}</dt>
                                        <dd className="tabular-nums">{detail.data.task_counts.overdue}</dd>
                                    </div>
                                </dl>
                                {detail.data.projects.length > 0 && (
                                    <section className="mt-5">
                                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                            {t('admin.users_memberships_heading')}
                                        </h3>
                                        <ul className="space-y-1 text-sm">
                                            {detail.data.projects.map((p) => (
                                                <li key={p.project_id} className="flex justify-between gap-3">
                                                    <span className="truncate">{p.project_title ?? p.project_id}</span>
                                                    <span className="text-muted-foreground">
                                                        {/* Localize the role from project_members.role — defaultValue
                                                          * falls back to the raw DB value if a new role is ever added
                                                          * without an i18n key (forward-compat). */}
                                                        {t(`admin.role_${p.role}` as never, { defaultValue: p.role })}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                )}

                                {/* Moderation actions. "Toggle admin" is the
                                  * only action shipped in this phase — reset
                                  * password and suspend need edge-function
                                  * work (admin.generateLink / updateUserById)
                                  * and are tracked as a follow-up wave.
                                  *
                                  * Self-demotion is disabled client-side as
                                  * well as blocked server-side (belt + braces):
                                  * the server raises `self_demotion_forbidden`
                                  * even if the button is clicked via devtools. */}
                                <section className="mt-5 border-t border-border pt-4 space-y-2">
                                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        {t('admin.users_moderation_heading')}
                                    </h3>
                                    {(() => {
                                        // Capture the non-null profile locally so TS preserves
                                        // the narrowing across the IIFE closure — the outer
                                        // ternary already proved detail.data is non-null.
                                        const profile = detail.data.profile;
                                        const targetUid = profile.id;
                                        const displayName = profile.display_name;
                                        const isSelf = currentUser?.id === targetUid;
                                        const currentlyAdmin = profile.is_admin;
                                        // `currentlySuspended` is memoized at the component top —
                                        // shadows the inline `Date.now()` that tripped the
                                        // react-hooks impurity lint. Same effective value.
                                        return (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant={currentlyAdmin ? 'destructive' : 'default'}
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={isSelf || toggleAdminMutation.isPending}
                                                    onClick={() => void handleToggleAdmin(targetUid, currentlyAdmin)}
                                                    aria-label={
                                                        currentlyAdmin
                                                            ? t('admin.users_revoke_admin_aria', { name: displayName })
                                                            : t('admin.users_grant_admin_aria', { name: displayName })
                                                    }
                                                    data-testid="admin-users-toggle-admin"
                                                >
                                                    {toggleAdminMutation.isPending ? (
                                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : currentlyAdmin ? (
                                                        <ShieldOff aria-hidden="true" className="mr-2 h-4 w-4" />
                                                    ) : (
                                                        <Shield aria-hidden="true" className="mr-2 h-4 w-4" />
                                                    )}
                                                    {currentlyAdmin
                                                        ? t('admin.users_revoke_admin_button')
                                                        : t('admin.users_grant_admin_button')}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant={currentlySuspended ? 'default' : 'destructive'}
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={isSelf || suspensionMutation.isPending}
                                                    onClick={() => void handleToggleSuspension(targetUid, currentlySuspended)}
                                                    aria-label={
                                                        currentlySuspended
                                                            ? t('admin.users_unsuspend_aria', { name: displayName })
                                                            : t('admin.users_suspend_aria', { name: displayName })
                                                    }
                                                    data-testid="admin-users-toggle-suspension"
                                                >
                                                    {suspensionMutation.isPending ? (
                                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : currentlySuspended ? (
                                                        <CheckCircle2 aria-hidden="true" className="mr-2 h-4 w-4" />
                                                    ) : (
                                                        <Ban aria-hidden="true" className="mr-2 h-4 w-4" />
                                                    )}
                                                    {currentlySuspended
                                                        ? t('admin.users_unsuspend_button')
                                                        : t('admin.users_suspend_button')}
                                                </Button>

                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full"
                                                    disabled={resetPasswordMutation.isPending}
                                                    onClick={() => void handleResetPassword(targetUid, displayName)}
                                                    aria-label={t('admin.users_reset_password_aria', { name: displayName })}
                                                    data-testid="admin-users-reset-password"
                                                >
                                                    {resetPasswordMutation.isPending ? (
                                                        <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <KeyRound aria-hidden="true" className="mr-2 h-4 w-4" />
                                                    )}
                                                    {t('admin.users_reset_password_button')}
                                                </Button>
                                            </>
                                        );
                                    })()}
                                    {currentUser?.id === detail.data.profile.id && (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {t('admin.users_self_moderation_note')}
                                        </p>
                                    )}
                                </section>
                            </>
                        )}
                    </aside>
                )}
            </div>
        </div>
    );
}

/**
 * Sortable column header. Renders a `<th>` with `aria-sort` + a visual
 * direction indicator (↑ / ↓ / ↕). Third click clears the sort back to
 * the server-returned order. Click handler toggles via the parent's
 * `onToggle` — the parent owns sort state so all columns share one.
 */
interface SortableThProps {
    label: string;
    sortKey: SortKey;
    align: 'left' | 'right';
    sort: { key: SortKey; dir: SortDir } | null;
    onToggle: (key: SortKey) => void;
    ariaSort: 'ascending' | 'descending' | 'none';
}

function SortableTh({ label, sortKey, align, sort, onToggle, ariaSort }: SortableThProps) {
    const active = sort?.key === sortKey;
    const Icon = !active ? ArrowUpDown : sort?.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
        <th
            scope="col"
            aria-sort={ariaSort}
            className={`px-4 py-2 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}
        >
            <button
                type="button"
                onClick={() => onToggle(sortKey)}
                className={`inline-flex items-center gap-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm ${align === 'right' ? 'flex-row-reverse' : ''} ${active ? 'text-slate-900' : ''}`}
                data-testid={`admin-users-sort-${sortKey}`}
            >
                {label}
                <Icon aria-hidden="true" className="h-3 w-3" />
            </button>
        </th>
    );
}
