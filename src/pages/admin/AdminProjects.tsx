import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2, ExternalLink, Plus } from 'lucide-react';
import { useAdminProjects } from '@/features/admin/hooks/useAdminProjects';
import { planter } from '@/shared/api/planterClient';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import useDebounce from '@/shared/lib/hooks/useDebounce';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import { Button } from '@/shared/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/shared/ui/select';
import type { AdminListProjectsFilter } from '@/shared/db/app.types';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['todo', 'not_started', 'in_progress', 'completed', 'planning'];

/** Admin "Manage Projects" surface (`/admin/projects`). */
export default function AdminProjects() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    const [rawSearch, setRawSearch] = useState('');
    const debouncedSearch = useDebounce(rawSearch.trim(), 250);
    const [status, setStatus] = useState('all');
    const [page, setPage] = useState(0);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const filter = useMemo<AdminListProjectsFilter>(
        () => ({ status, search: debouncedSearch || undefined }),
        [status, debouncedSearch],
    );

    const query = useAdminProjects(filter, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    const projects = useMemo(() => query.data ?? [], [query.data]);

    const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
        setter(v);
        setPage(0);
    };

    const handleDelete = async (id: string) => {
        const ok = await confirm({
            title: t('admin.projects_delete_confirm_title'),
            description: t('admin.projects_delete_confirm_description'),
            confirmText: t('admin.projects_delete_confirm_button'),
        });
        if (!ok) return;
        setDeletingId(id);
        try {
            const { error } = await planter.rpc('delete_task', { p_task_id: id });
            if (error) throw error;
            toast.success(t('admin.projects_toast_deleted'));
            queryClient.invalidateQueries({ queryKey: ['adminProjects'] });
        } catch {
            toast.error(t('admin.projects_toast_error'));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8" data-testid="admin-projects">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('admin.projects_title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('admin.projects_subtitle')}</p>
                </div>
                <Button
                    onClick={() => navigate('/admin/projects?action=new-project')}
                    data-testid="admin-projects-new"
                    className="shrink-0"
                >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('admin.projects_new_button')}
                </Button>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-xs">
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.projects_metric_total')}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{projects.length}</p>
                </div>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="admin-projects-filters">
                <div className="flex w-full flex-col gap-1 sm:w-64">
                    <span className="text-xs text-muted-foreground">{t('admin.projects_search_placeholder')}</span>
                    <input
                        type="search"
                        value={rawSearch}
                        onChange={(e) => resetPage(setRawSearch)(e.target.value)}
                        placeholder={t('admin.projects_search_placeholder')}
                        aria-label={t('admin.projects_search_aria')}
                        data-testid="admin-projects-search"
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-44">
                    <span className="text-xs text-muted-foreground">{t('admin.projects_filter_status_label')}</span>
                    <Select value={status} onValueChange={resetPage(setStatus)}>
                        <SelectTrigger className="w-full bg-card" data-testid="admin-projects-filter-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.projects_filter_status_all')}</SelectItem>
                            {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="admin-projects-table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.projects_col_title')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.projects_col_owner')}</th>
                                <th scope="col" className="px-4 py-2 text-right font-semibold">{t('admin.projects_col_members')}</th>
                                <th scope="col" className="px-4 py-2 text-right font-semibold">{t('admin.projects_col_tasks')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.projects_col_status')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.projects_col_created')}</th>
                                <th scope="col" className="px-4 py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {query.isLoading ? (
                                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{t('admin.loading')}</td></tr>
                            ) : query.error instanceof Error ? (
                                <tr><td colSpan={7} className="px-4 py-6 text-center text-red-600">{query.error.message}</td></tr>
                            ) : projects.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">{t('admin.projects_empty')}</td></tr>
                            ) : (
                                projects.map((p) => (
                                    <tr key={p.id} className="border-t border-border hover:bg-slate-50" data-testid={`admin-projects-row-${p.id}`}>
                                        <td className="px-4 py-2 font-medium text-slate-900">{p.title ?? t('admin.untitled')}</td>
                                        <td className="px-4 py-2 text-slate-700">{p.owner_email ?? '—'}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{p.member_count}</td>
                                        <td className="px-4 py-2 text-right tabular-nums">{p.task_count}</td>
                                        <td className="px-4 py-2 text-slate-700">{p.status ?? '—'}</td>
                                        <td className="px-4 py-2">{p.created_at ? formatDisplayDate(p.created_at) : '—'}</td>
                                        <td className="px-4 py-2">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => navigate(`/project/${p.id}`)}
                                                    data-testid={`admin-projects-open-${p.id}`}
                                                    aria-label={t('admin.projects_open')}
                                                >
                                                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    disabled={deletingId === p.id}
                                                    onClick={() => handleDelete(p.id)}
                                                    data-testid={`admin-projects-delete-${p.id}`}
                                                    aria-label={t('admin.projects_delete')}
                                                    className="text-red-600 hover:text-red-700"
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>
                        {t('admin.pagination_prev')}
                    </Button>
                    <span className="text-sm text-muted-foreground">{t('admin.pagination_page', { page: page + 1 })}</span>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={projects.length < PAGE_SIZE}
                        onClick={() => setPage((n) => n + 1)}
                    >
                        {t('admin.pagination_next')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
