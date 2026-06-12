import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { planter } from '@/shared/api/planterClient';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import { Button } from '@/shared/ui/button';
import { Plus } from 'lucide-react';

/**
 * Admin templates surface (`/admin/templates`). Lists template roots with a
 * version stamp + clone drilldown (Wave 36), plus root metadata editing,
 * delete, and a hand-off into the full tree editor (Phase 4).
 */
export default function AdminTemplates() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    const templates = useQuery({
        queryKey: ['adminTemplates'],
        queryFn: () => planter.admin.listTemplateRoots(),
    });

    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const clones = useQuery({
        queryKey: ['adminTemplateClones', selectedTemplateId],
        queryFn: () => planter.admin.listTemplateClones(selectedTemplateId as string),
        enabled: Boolean(selectedTemplateId),
    });
    // Full root task (title / description / settings.published) for the edit form.
    const detail = useQuery({
        queryKey: ['adminTemplateDetail', selectedTemplateId],
        queryFn: () => planter.entities.Task.get(selectedTemplateId as string),
        enabled: Boolean(selectedTemplateId),
    });

    const templateRoots = useMemo(() => templates.data ?? [], [templates.data]);
    const clonedInstances = useMemo(() => clones.data ?? [], [clones.data]);
    const staleCount = useMemo(() => clonedInstances.filter((c) => c.stale).length, [clonedInstances]);

    // Edit form state, hydrated whenever the detail query resolves.
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [published, setPublished] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        const task = detail.data;
        if (!task) return;
        setTitle(task.title ?? '');
        setDescription(task.description ?? '');
        const settings = (task.settings ?? {}) as Record<string, unknown>;
        setPublished(settings.published === true);
    }, [detail.data]);

    const handleSave = async () => {
        if (!selectedTemplateId || !detail.data) return;
        setSaving(true);
        try {
            const prevSettings = (detail.data.settings ?? {}) as Record<string, unknown>;
            await planter.entities.Task.update(selectedTemplateId, {
                title: title.trim(),
                description: description.trim(),
                settings: { ...prevSettings, published },
            });
            toast.success(t('admin.templates_toast_saved'));
            queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
            queryClient.invalidateQueries({ queryKey: ['adminTemplateDetail', selectedTemplateId] });
        } catch {
            toast.error(t('admin.templates_toast_error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!selectedTemplateId) return;
        const ok = await confirm({
            title: t('admin.templates_delete_confirm_title'),
            description: t('admin.templates_delete_confirm_description'),
            confirmText: t('admin.templates_delete_confirm_button'),
        });
        if (!ok) return;
        setDeleting(true);
        try {
            const { error } = await planter.rpc('delete_task', { p_task_id: selectedTemplateId });
            if (error) throw error;
            toast.success(t('admin.templates_toast_deleted'));
            setSelectedTemplateId(null);
            queryClient.invalidateQueries({ queryKey: ['adminTemplates'] });
        } catch {
            toast.error(t('admin.templates_toast_error'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8" data-testid="admin-templates">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('admin.templates_title')}</h1>
                    <p className="mt-1 text-sm text-muted-foreground">{t('admin.templates_subtitle')}</p>
                </div>
                <Button
                    onClick={() => navigate('/admin/templates?action=new-template')}
                    data-testid="admin-templates-new"
                    className="shrink-0"
                >
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('admin.templates_new_button')}
                </Button>
            </header>

            {/* Metrics */}
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:max-w-xl" data-testid="admin-templates-metrics">
                {[
                    { key: 'count', label: t('admin.templates_metric_count'), value: templateRoots.length },
                    { key: 'clones', label: t('admin.templates_metric_clones'), value: selectedTemplateId ? clonedInstances.length : '—' },
                    { key: 'stale', label: t('admin.templates_metric_stale'), value: selectedTemplateId ? staleCount : '—' },
                ].map((m) => (
                    <div key={m.key} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{m.label}</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{m.value}</p>
                    </div>
                ))}
            </div>

            {templates.isLoading ? (
                <p className="text-sm text-muted-foreground">{t('admin.loading')}</p>
            ) : templates.error instanceof Error ? (
                <p className="text-sm text-red-600">{templates.error.message}</p>
            ) : (
                <div className="flex flex-col gap-6 xl:flex-row">
                    <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" data-testid="admin-templates-table">
                                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                                    <tr>
                                        <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.templates_col_title')}</th>
                                        <th scope="col" className="px-4 py-2 text-right font-semibold">{t('admin.templates_col_version')}</th>
                                        <th scope="col" className="px-4 py-2 text-left font-semibold">{t('admin.templates_col_updated')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {templateRoots.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                                                {t('admin.templates_empty')}
                                            </td>
                                        </tr>
                                    ) : (
                                        templateRoots.map((tpl) => (
                                            <tr
                                                key={tpl.id}
                                                className={
                                                    'cursor-pointer border-t border-border hover:bg-slate-50 ' +
                                                    (selectedTemplateId === tpl.id ? 'bg-brand-50' : '')
                                                }
                                                onClick={() => setSelectedTemplateId(tpl.id)}
                                                data-testid={`admin-templates-row-${tpl.id}`}
                                            >
                                                <td className="px-4 py-2">{tpl.title ?? t('admin.untitled')}</td>
                                                <td className="px-4 py-2 text-right tabular-nums">
                                                    {t('admin.templates_version_prefix', { version: tpl.template_version })}
                                                </td>
                                                <td className="px-4 py-2">{tpl.updated_at ? formatDisplayDate(tpl.updated_at) : '—'}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {selectedTemplateId && (
                        <aside
                            className="w-full flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm xl:w-96"
                            data-testid="admin-templates-aside"
                        >
                            {/* Edit form */}
                            <h2 className="text-lg font-semibold text-slate-900">{t('admin.templates_edit_heading')}</h2>
                            <div className="mt-3 flex flex-col gap-3">
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="font-medium text-slate-700">{t('admin.templates_field_title')}</span>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        data-testid="admin-templates-edit-title"
                                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                                <label className="flex flex-col gap-1 text-sm">
                                    <span className="font-medium text-slate-700">{t('admin.templates_field_description')}</span>
                                    <textarea
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={3}
                                        data-testid="admin-templates-edit-description"
                                        className="rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                    />
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={published}
                                        onChange={(e) => setPublished(e.target.checked)}
                                        data-testid="admin-templates-edit-published"
                                        className="h-4 w-4 rounded border-input"
                                    />
                                    <span className="font-medium text-slate-700">{t('admin.templates_field_published')}</span>
                                </label>

                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Button onClick={handleSave} disabled={saving || !detail.data} data-testid="admin-templates-save">
                                        {t('admin.templates_save')}
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => navigate(`/project/${selectedTemplateId}`)}
                                        data-testid="admin-templates-open-editor"
                                    >
                                        {t('admin.templates_open_editor')}
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={handleDelete}
                                        disabled={deleting}
                                        data-testid="admin-templates-delete"
                                    >
                                        {t('admin.templates_delete')}
                                    </Button>
                                </div>
                            </div>

                            {/* Clones */}
                            <h3 className="mt-6 text-base font-semibold text-slate-900">{t('admin.templates_clones_heading')}</h3>
                            {clones.isLoading ? (
                                <p className="mt-3 text-sm text-muted-foreground">{t('admin.loading')}</p>
                            ) : clones.error instanceof Error ? (
                                <p className="mt-3 text-sm text-red-600">{clones.error.message}</p>
                            ) : clonedInstances.length === 0 ? (
                                <p className="mt-3 text-sm text-muted-foreground">{t('admin.templates_clones_empty')}</p>
                            ) : (
                                <ul className="mt-3 divide-y divide-border">
                                    {clonedInstances.map((inst) => (
                                        <li key={inst.project_id} className="flex items-start justify-between gap-3 py-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium text-slate-900">
                                                    {inst.title ?? t('admin.untitled')}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t('admin.templates_cloned_from', { version: inst.cloned_from_template_version ?? '—' })}
                                                    {inst.stale ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{t('admin.templates_stale_badge')}</span> : null}
                                                </p>
                                                {inst.stale ? (
                                                    <p className="mt-1 text-xs leading-5 text-slate-600">
                                                        {t('admin.templates_stale_explanation')}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </aside>
                    )}
                </div>
            )}
        </div>
    );
}
