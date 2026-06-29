import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import planter from '@/shared/api/planterClient';
import {
    useAdminLibraryItems,
    useAdminLibraryTemplates,
} from '@/features/admin/hooks/useAdminLibraryItems';
import {
    useCreateLibraryItem,
    useUpdateLibraryItem,
    useDeleteLibraryItem,
} from '@/features/admin/hooks/useLibraryItemMutations';
import CreateLibraryItemDialog from '@/features/admin/components/CreateLibraryItemDialog';
import { useAuth } from '@/shared/contexts/auth-context';
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
import type {
    AdminLibraryItemRow,
    AdminLibraryItemsFilter,
    LibraryItemType,
} from '@/shared/db/app.types';

const ITEM_TYPES: LibraryItemType[] = ['phase', 'milestone', 'task'];

type PanelState =
    | { mode: 'create' }
    | { mode: 'edit'; item: AdminLibraryItemRow }
    | null;

/**
 * Master Library admin surface (`/admin/library`). Lists every template-origin
 * item, with search + type/template filters, and full create/edit/delete of
 * loose reusable items. Edits apply to future copies only — existing project
 * clones are independent rows.
 */
export default function AdminLibrary() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const confirm = useConfirm();

    const [rawSearch, setRawSearch] = useState('');
    const debouncedSearch = useDebounce(rawSearch.trim(), 250);
    const [typeFilter, setTypeFilter] = useState<NonNullable<AdminLibraryItemsFilter['taskType']>>('all');
    const [templateFilter, setTemplateFilter] = useState<string>('all');
    const [panel, setPanel] = useState<PanelState>(null);
    const [showCreateDialog, setShowCreateDialog] = useState(false);

    const filter = useMemo<AdminLibraryItemsFilter>(
        () => ({
            taskType: typeFilter,
            templateId: templateFilter,
            search: debouncedSearch || undefined,
        }),
        [typeFilter, templateFilter, debouncedSearch],
    );

    const itemsQuery = useAdminLibraryItems(filter);
    const templatesQuery = useAdminLibraryTemplates();
    const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
    const templates = useMemo(() => templatesQuery.data ?? [], [templatesQuery.data]);

    const createMutation = useCreateLibraryItem();
    const updateMutation = useUpdateLibraryItem();
    const deleteMutation = useDeleteLibraryItem();

    // Metrics reflect the *current filtered view* so admins can read off counts
    // for whatever slice they're inspecting.
    const metrics = useMemo(() => {
        let phases = 0;
        let milestones = 0;
        let tasks = 0;
        let loose = 0;
        for (const it of items) {
            if (it.task_type === 'phase') phases += 1;
            else if (it.task_type === 'milestone') milestones += 1;
            else if (it.task_type === 'task') tasks += 1;
            if (it.is_loose) loose += 1;
        }
        return { total: items.length, phases, milestones, tasks, loose };
    }, [items]);

    const typeLabel = (type: string | null): string => {
        switch (type) {
            case 'phase':
                return t('admin.library_type_phase');
            case 'milestone':
                return t('admin.library_type_milestone');
            case 'task':
                return t('admin.library_type_task');
            case 'project':
                return t('admin.library_type_project');
            case 'subtask':
                return t('admin.library_type_subtask');
            default:
                return type ?? '—';
        }
    };

    const handleDelete = async (item: AdminLibraryItemRow) => {
        const ok = await confirm({
            title: t('admin.library_delete_button'),
            description: t('admin.library_delete_confirm'),
            confirmText: t('admin.library_delete_button'),
        });
        if (!ok) return;
        try {
            await deleteMutation.mutateAsync(item.id);
            toast.success(t('admin.library_toast_deleted'));
            setPanel(null);
        } catch {
            toast.error(t('admin.library_toast_error'));
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8" data-testid="admin-library">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('admin.library_title')}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('admin.library_subtitle')}</p>
                </div>
                <Button
                    onClick={() => { setPanel(null); setShowCreateDialog(true); }}
                    data-testid="admin-library-add"
                    className="shrink-0"
                >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('admin.library_add_button')}
                </Button>
            </header>

            {/* Metrics */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="admin-library-metrics">
                {[
                    { key: 'total', label: t('admin.library_metric_total'), value: metrics.total },
                    { key: 'phases', label: t('admin.library_metric_phases'), value: metrics.phases },
                    { key: 'milestones', label: t('admin.library_metric_milestones'), value: metrics.milestones },
                    { key: 'tasks', label: t('admin.library_metric_tasks'), value: metrics.tasks },
                    { key: 'loose', label: t('admin.library_metric_loose'), value: metrics.loose },
                ].map((m) => (
                    <div key={m.key} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{m.value}</p>
                    </div>
                ))}
            </div>

            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-end gap-3" data-testid="admin-library-filters">
                <div className="flex w-full flex-col gap-1 sm:w-64">
                    <span className="text-xs text-muted-foreground">{t('admin.library_search_placeholder')}</span>
                    <input
                        type="search"
                        value={rawSearch}
                        onChange={(e) => setRawSearch(e.target.value)}
                        placeholder={t('admin.library_search_placeholder')}
                        aria-label={t('admin.library_search_aria')}
                        data-testid="admin-library-search"
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-40">
                    <span className="text-xs text-muted-foreground">{t('admin.library_filter_type_label')}</span>
                    <Select
                        value={typeFilter}
                        onValueChange={(v) => setTypeFilter(v as NonNullable<AdminLibraryItemsFilter['taskType']>)}
                    >
                        <SelectTrigger className="w-full bg-card" data-testid="admin-library-filter-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.library_filter_type_all')}</SelectItem>
                            <SelectItem value="phase">{t('admin.library_type_phase')}</SelectItem>
                            <SelectItem value="milestone">{t('admin.library_type_milestone')}</SelectItem>
                            <SelectItem value="task">{t('admin.library_type_task')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-56">
                    <span className="text-xs text-muted-foreground">{t('admin.library_filter_template_label')}</span>
                    <Select value={templateFilter} onValueChange={setTemplateFilter}>
                        <SelectTrigger className="w-full bg-card" data-testid="admin-library-filter-template">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('admin.library_filter_template_all')}</SelectItem>
                            <SelectItem value="__none__">{t('admin.library_filter_template_none')}</SelectItem>
                            {templates.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                    {tpl.title ?? t('admin.untitled')}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex flex-col gap-6 xl:flex-row">
                {/* Table */}
                <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="admin-library-table">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                                <tr>
                                    <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.library_col_title')}</th>
                                    <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.library_col_type')}</th>
                                    <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.library_col_template')}</th>
                                    <th scope="col" className="px-4 py-2 text-right font-semibold">{t('admin.library_col_offset')}</th>
                                    <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.library_col_updated')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsQuery.isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                                            {t('admin.loading')}
                                        </td>
                                    </tr>
                                ) : itemsQuery.error instanceof Error ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-red-600">
                                            {itemsQuery.error.message}
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                                            {t('admin.library_empty')}
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => (
                                        <tr
                                            key={item.id}
                                            className={
                                                'cursor-pointer border-t border-border hover:bg-slate-50 ' +
                                                (panel?.mode === 'edit' && panel.item.id === item.id ? 'bg-brand-50' : '')
                                            }
                                            onClick={() => setPanel({ mode: 'edit', item })}
                                            data-testid={`admin-library-row-${item.id}`}
                                        >
                                            <td className="px-4 py-2 font-medium text-slate-900">{item.title ?? t('admin.untitled')}</td>
                                            <td className="px-4 py-2">
                                                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                                    {typeLabel(item.task_type)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-slate-700">
                                                {item.is_loose ? (
                                                    <span className="text-muted-foreground">{t('admin.library_unassigned')}</span>
                                                ) : (
                                                    item.template_title ?? t('admin.untitled')
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right tabular-nums">{item.days_from_start ?? '—'}</td>
                                            <td className="px-4 py-2">{item.updated_at ? formatDisplayDate(item.updated_at) : '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Detail / form panel */}
                {panel && (
                    <LibraryItemPanel
                        key={panel.mode === 'edit' ? panel.item.id : 'create'}
                        panel={panel}
                        isLoose={panel.mode === 'edit' ? panel.item.is_loose : true}
                        saving={createMutation.isPending || updateMutation.isPending}
                        deleting={deleteMutation.isPending}
                        onClose={() => setPanel(null)}
                        onDelete={panel.mode === 'edit' ? () => handleDelete(panel.item) : undefined}
                        onSubmit={async (values) => {
                            try {
                                if (panel.mode === 'create') {
                                    if (!user?.id) {
                                        toast.error(t('admin.library_toast_error'));
                                        return;
                                    }
                                    await createMutation.mutateAsync({
                                        title: values.title,
                                        description: values.description,
                                        taskType: values.taskType,
                                        daysFromStart: values.daysFromStart,
                                        purpose: values.purpose,
                                        actions: values.actions,
                                        notes: values.notes,
                                        duration: values.duration,
                                        userId: user.id,
                                    });
                                    toast.success(t('admin.library_toast_created'));
                                } else {
                                    await updateMutation.mutateAsync({
                                        id: panel.item.id,
                                        title: values.title,
                                        description: values.description,
                                        taskType: values.taskType,
                                        daysFromStart: values.daysFromStart,
                                        purpose: values.purpose,
                                        actions: values.actions,
                                        notes: values.notes,
                                        duration: values.duration,
                                    });
                                    toast.success(t('admin.library_toast_updated'));
                                }
                                setPanel(null);
                            } catch {
                                toast.error(t('admin.library_toast_error'));
                            }
                        }}
                    />
                )}
            </div>

            <CreateLibraryItemDialog
                open={showCreateDialog}
                onClose={() => setShowCreateDialog(false)}
                onCreate={async (payload) => {
                    if (!user?.id) {
                        toast.error(t('admin.library_toast_error'));
                        throw new Error('missing user');
                    }
                    try {
                        await createMutation.mutateAsync({ ...payload, userId: user.id });
                    } catch (err) {
                        toast.error(t('admin.library_toast_error'));
                        throw err;
                    }
                    toast.success(t('admin.library_toast_created'));
                    setShowCreateDialog(false);
                }}
            />
        </div>
    );
}

interface FormValues {
    title: string;
    description: string;
    taskType: LibraryItemType;
    daysFromStart: number | null;
    purpose: string;
    actions: string;
    notes: string;
    duration: number | null;
}

interface LibraryItemPanelProps {
    panel: NonNullable<PanelState>;
    isLoose: boolean;
    saving: boolean;
    deleting: boolean;
    onClose: () => void;
    onDelete?: () => void;
    onSubmit: (values: FormValues) => void;
}

/**
 * Edit fetches the full task first because the admin_library_items list RPC
 * omits purpose/actions/notes/duration. We hold the form unmounted until the
 * row arrives so the inner form can initialize its state straight from props
 * (no setState-in-effect). The create dialog already has these via TaskForm.
 */
function LibraryItemPanel(props: LibraryItemPanelProps) {
    const { panel } = props;
    const { t } = useTranslation();
    const editItemId = panel.mode === 'edit' ? panel.item.id : null;
    const fullItem = useQuery({
        queryKey: ['adminLibraryItemFull', editItemId],
        queryFn: () => planter.entities.Task.get(editItemId as string),
        enabled: editItemId !== null,
        staleTime: 0,
    });

    if (editItemId !== null && fullItem.isLoading) {
        return (
            <aside
                className="w-full flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm xl:w-96"
                data-testid="admin-library-panel"
            >
                <p className="text-sm text-muted-foreground">{t('common.loading')}…</p>
            </aside>
        );
    }

    const full = fullItem.data ?? null;
    const initial: FormValues =
        panel.mode === 'edit'
            ? {
                  title: panel.item.title ?? '',
                  description: panel.item.description ?? '',
                  taskType: (ITEM_TYPES.includes(panel.item.task_type as LibraryItemType)
                      ? (panel.item.task_type as LibraryItemType)
                      : 'task'),
                  daysFromStart: panel.item.days_from_start,
                  purpose: full?.purpose ?? '',
                  actions: full?.actions ?? '',
                  notes: full?.notes ?? '',
                  duration: full?.duration ?? 0,
              }
            : { title: '', description: '', taskType: 'phase', daysFromStart: 0, purpose: '', actions: '', notes: '', duration: 0 };

    return <LibraryItemForm {...props} initial={initial} />;
}

function LibraryItemForm({ panel, isLoose, saving, deleting, onClose, onDelete, onSubmit, initial }: LibraryItemPanelProps & { initial: FormValues }) {
    const { t } = useTranslation();
    const [values, setValues] = useState<FormValues>(initial);
    const [touched, setTouched] = useState(false);

    const titleError = touched && values.title.trim().length === 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (values.title.trim().length === 0) return;
        onSubmit({
            ...values,
            title: values.title.trim(),
            description: values.description.trim(),
            purpose: values.purpose.trim(),
            actions: values.actions.trim(),
            notes: values.notes.trim(),
        });
    };

    return (
        <aside
            className="w-full flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm xl:w-96"
            data-testid="admin-library-panel"
        >
            <div className="mb-4 flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                    {panel.mode === 'create' ? t('admin.library_form_create_title') : t('admin.library_form_edit_title')}
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('admin.library_form_cancel')}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_title_label')}</span>
                    <input
                        type="text"
                        value={values.title}
                        onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
                        data-testid="admin-library-form-title"
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    {titleError && <span className="text-xs text-red-600">{t('admin.library_form_title_required')}</span>}
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_description_label')}</span>
                    <textarea
                        value={values.description}
                        onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
                        rows={3}
                        data-testid="admin-library-form-description"
                        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_purpose_label')}</span>
                    <textarea
                        value={values.purpose}
                        onChange={(e) => setValues((v) => ({ ...v, purpose: e.target.value }))}
                        rows={2}
                        data-testid="admin-library-form-purpose"
                        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_actions_label')}</span>
                    <textarea
                        value={values.actions}
                        onChange={(e) => setValues((v) => ({ ...v, actions: e.target.value }))}
                        rows={2}
                        data-testid="admin-library-form-actions"
                        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_notes_label')}</span>
                    <textarea
                        value={values.notes}
                        onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                        rows={2}
                        data-testid="admin-library-form-notes"
                        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <div className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_type_label')}</span>
                    <Select
                        value={values.taskType}
                        disabled={!isLoose}
                        onValueChange={(v) => setValues((vals) => ({ ...vals, taskType: v as LibraryItemType }))}
                    >
                        <SelectTrigger className="w-full bg-card" data-testid="admin-library-form-type">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="phase">{t('admin.library_type_phase')}</SelectItem>
                            <SelectItem value="milestone">{t('admin.library_type_milestone')}</SelectItem>
                            <SelectItem value="task">{t('admin.library_type_task')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_offset_label')}</span>
                    <input
                        type="number"
                        value={values.daysFromStart ?? 0}
                        onChange={(e) =>
                            setValues((v) => ({
                                ...v,
                                daysFromStart: e.target.value === '' ? null : Number(e.target.value),
                            }))
                        }
                        data-testid="admin-library-form-offset"
                        className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-slate-700">{t('admin.library_form_duration_label')}</span>
                    <input
                        type="number"
                        min="0"
                        value={values.duration ?? 0}
                        onChange={(e) =>
                            setValues((v) => ({
                                ...v,
                                duration: e.target.value === '' ? null : Number(e.target.value),
                            }))
                        }
                        data-testid="admin-library-form-duration"
                        className="h-9 w-32 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </label>

                <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                    {t('admin.library_form_future_note')}
                </p>

                <div className="flex items-center justify-between gap-2 pt-1">
                    <Button type="submit" disabled={saving} data-testid="admin-library-form-save">
                        {panel.mode === 'create' ? t('admin.library_form_create_submit') : t('admin.library_form_save')}
                    </Button>
                    {panel.mode === 'edit' && isLoose && onDelete && (
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={deleting}
                            onClick={onDelete}
                            data-testid="admin-library-form-delete"
                        >
                            {t('admin.library_delete_button')}
                        </Button>
                    )}
                </div>
            </form>
        </aside>
    );
}
