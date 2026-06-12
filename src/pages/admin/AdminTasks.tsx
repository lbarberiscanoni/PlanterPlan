import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAdminTasks } from '@/features/admin/hooks/useAdminTasks';
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
import type { AdminListTasksFilter } from '@/shared/db/app.types';

const PAGE_SIZE = 50;
const STATUS_OPTIONS = ['todo', 'not_started', 'in_progress', 'completed'];
const TYPE_OPTIONS = ['phase', 'milestone', 'task'];

/** Admin "Manage Tasks" surface (`/admin/tasks`). Read + filter + drill-in. */
export default function AdminTasks() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [rawSearch, setRawSearch] = useState('');
    const debouncedSearch = useDebounce(rawSearch.trim(), 250);
    const [status, setStatus] = useState('all');
    const [taskType, setTaskType] = useState('all');
    const [page, setPage] = useState(0);

    const filter = useMemo<AdminListTasksFilter>(
        () => ({ status, taskType, search: debouncedSearch || undefined }),
        [status, taskType, debouncedSearch],
    );

    const query = useAdminTasks(filter, { limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    const tasks = useMemo(() => query.data ?? [], [query.data]);

    const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
        setter(v);
        setPage(0);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8" data-testid="admin-tasks">
            <header className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('admin.tasks_title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('admin.tasks_subtitle')}</p>
            </header>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:max-w-xs">
                <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('admin.tasks_metric_total')}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{tasks.length}</p>
                </div>
            </div>

            <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="admin-tasks-filters">
                <div className="flex w-full flex-col gap-1 sm:w-64">
                    <span className="text-xs text-muted-foreground">{t('admin.tasks_search_placeholder')}</span>
                    <input
                        type="search"
                        value={rawSearch}
                        onChange={(e) => resetPage(setRawSearch)(e.target.value)}
                        placeholder={t('admin.tasks_search_placeholder')}
                        aria-label={t('admin.tasks_search_aria')}
                        data-testid="admin-tasks-search"
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-44">
                    <span className="text-xs text-muted-foreground">{t('admin.tasks_filter_status_label')}</span>
                    <Select value={status} onValueChange={resetPage(setStatus)}>
                        <SelectTrigger className="w-full bg-card" data-testid="admin-tasks-filter-status">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.tasks_filter_status_all')}</SelectItem>
                            {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-40">
                    <span className="text-xs text-muted-foreground">{t('admin.tasks_filter_type_label')}</span>
                    <Select value={taskType} onValueChange={resetPage(setTaskType)}>
                        <SelectTrigger className="w-full bg-card" data-testid="admin-tasks-filter-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.tasks_filter_type_all')}</SelectItem>
                            {TYPE_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="admin-tasks-table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_title')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_type')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_project')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_assignee')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_status')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.tasks_col_due')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {query.isLoading ? (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">{t('admin.loading')}</td></tr>
                            ) : query.error instanceof Error ? (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-red-600">{query.error.message}</td></tr>
                            ) : tasks.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">{t('admin.tasks_empty')}</td></tr>
                            ) : (
                                tasks.map((task) => (
                                    <tr
                                        key={task.id}
                                        className={'border-t border-border hover:bg-slate-50 ' + (task.project_id ? 'cursor-pointer' : '')}
                                        onClick={() => task.project_id && navigate(`/project/${task.project_id}`)}
                                        data-testid={`admin-tasks-row-${task.id}`}
                                    >
                                        <td className="px-4 py-2 font-medium text-slate-900">{task.title ?? t('admin.untitled')}</td>
                                        <td className="px-4 py-2">
                                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{task.task_type ?? '—'}</span>
                                        </td>
                                        <td className="px-4 py-2 text-slate-700">{task.project_title ?? '—'}</td>
                                        <td className="px-4 py-2 text-slate-700">
                                            {task.assignee_email ?? <span className="text-muted-foreground">{t('admin.tasks_unassigned')}</span>}
                                        </td>
                                        <td className="px-4 py-2 text-slate-700">{task.status ?? '—'}</td>
                                        <td className="px-4 py-2">{task.due_date ? formatDisplayDate(task.due_date) : '—'}</td>
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
                        disabled={tasks.length < PAGE_SIZE}
                        onClick={() => setPage((n) => n + 1)}
                    >
                        {t('admin.pagination_next')}
                    </Button>
                </div>
            </div>
        </div>
    );
}
