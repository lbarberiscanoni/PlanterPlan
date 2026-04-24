import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { planter } from '@/shared/api/planterClient';
import { formatDisplayDate } from '@/shared/lib/date-engine';

/**
 * Wave 36 Task 1 — admin templates list with `template_version` column and a
 * "cloned-from" drilldown. Admins spot instances stuck on older template
 * iterations via the version stamp on each instance's
 * `settings.cloned_from_template_version`.
 */
export default function AdminTemplates() {
    const { t } = useTranslation();
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
    const templateRoots = useMemo(() => templates.data ?? [], [templates.data]);
    const clonedInstances = useMemo(() => clones.data ?? [], [clones.data]);
    const currentTemplate = useMemo(
        () => templateRoots.find((t) => t.id === selectedTemplateId) ?? null,
        [templateRoots, selectedTemplateId],
    );

    return (
        <div className="p-8" data-testid="admin-templates">
            <header className="mb-6">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t('admin.templates_title')}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t('admin.templates_subtitle')}</p>
            </header>

            {templates.isLoading ? (
                <p className="text-sm text-muted-foreground">{t('admin.loading')}</p>
            ) : templates.error instanceof Error ? (
                <p className="text-sm text-red-600">{templates.error.message}</p>
            ) : (
                <div className="flex gap-6">
                    <div className="flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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

                    {selectedTemplateId && (
                        <aside
                            className="w-96 flex-shrink-0 rounded-lg border border-border bg-card p-5 shadow-sm"
                            data-testid="admin-templates-clones"
                        >
                            <h2 className="text-lg font-semibold text-slate-900">{t('admin.templates_clones_heading')}</h2>
                            {clones.isLoading ? (
                                <p className="mt-3 text-sm text-muted-foreground">{t('admin.loading')}</p>
                            ) : clones.error instanceof Error ? (
                                <p className="mt-3 text-sm text-red-600">{clones.error.message}</p>
                            ) : clonedInstances.length === 0 ? (
                                <p className="mt-3 text-sm text-muted-foreground">{t('admin.templates_clones_empty')}</p>
                            ) : (
                                <ul className="mt-3 divide-y divide-border">
                                    {clonedInstances.map((inst) => {
                                        return (
                                            <li key={inst.project_id} className="flex items-start justify-between gap-3 py-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-medium text-slate-900">
                                                        {inst.title ?? t('admin.untitled')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t('admin.templates_cloned_from', { version: inst.cloned_from_template_version ?? '—' })}
                                                        {inst.stale && currentTemplate ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{t('admin.templates_stale_badge')}</span> : null}
                                                    </p>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </aside>
                    )}
                </div>
            )}
        </div>
    );
}
