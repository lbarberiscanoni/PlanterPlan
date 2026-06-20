import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    Plus, Search, X, ExternalLink, Pencil, Trash2, Loader2,
    FileText, Sheet, Presentation, HardDrive, Video, Globe,
    type LucideIcon,
} from 'lucide-react';
import { useResources } from '@/features/resources/hooks/useResources';
import {
    useCreateResource, useUpdateResource, useDeleteResource,
} from '@/features/resources/hooks/useResourceMutations';
import { useIsAdmin } from '@/features/admin/hooks/useIsAdmin';
import { useAuth } from '@/shared/contexts/auth-context';
import { useConfirm } from '@/shared/ui/confirm-dialog-context';
import useDebounce from '@/shared/lib/hooks/useDebounce';
import { safeUrl } from '@/shared/lib/safe-url';
import { formatDisplayDate } from '@/shared/lib/date-engine';
import { detectResourceKind, RESOURCE_KINDS, type ResourceKind } from '@/shared/lib/resource-kind';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/shared/ui/dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/ui/select';
import type { ResourceRow } from '@/shared/db/app.types';

const KIND_ICONS: Record<string, LucideIcon> = {
    FileText, Sheet, Presentation, HardDrive, Video, Globe,
};

const ALL_KINDS = '__all__';

type EditState = { mode: 'create' } | { mode: 'edit'; resource: ResourceRow } | null;

export default function Resources() {
    const { t } = useTranslation();
    const isAdmin = useIsAdmin();
    const { user } = useAuth();
    const confirm = useConfirm();

    const { data: resources = [], isLoading, error } = useResources();
    const createMutation = useCreateResource();
    const updateMutation = useUpdateResource();
    const deleteMutation = useDeleteResource();

    const [rawSearch, setRawSearch] = useState('');
    const search = useDebounce(rawSearch.trim().toLowerCase(), 200);
    const [kindFilter, setKindFilter] = useState<ResourceKind | typeof ALL_KINDS>(ALL_KINDS);
    const [edit, setEdit] = useState<EditState>(null);

    const kindLabel = (kind: ResourceKind) => t(`resources.kinds.${kind}`);

    const rows = useMemo(() => {
        return resources
            .map((r) => ({ resource: r, kindInfo: detectResourceKind(r.url) }))
            .filter(({ resource, kindInfo }) => {
                if (kindFilter !== ALL_KINDS && kindInfo.kind !== kindFilter) return false;
                if (!search) return true;
                return (
                    (resource.name ?? '').toLowerCase().includes(search) ||
                    (resource.url ?? '').toLowerCase().includes(search)
                );
            })
            .sort((a, b) => (a.resource.name ?? '').localeCompare(b.resource.name ?? ''));
    }, [resources, kindFilter, search]);

    const handleDelete = async (resource: ResourceRow) => {
        const ok = await confirm({
            title: t('resources.delete_button'),
            description: t('resources.delete_confirm'),
            confirmText: t('resources.delete_button'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await deleteMutation.mutateAsync(resource.id);
            toast.success(t('resources.toast_deleted'));
        } catch {
            toast.error(t('resources.toast_error'));
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8" data-testid="resources-page">
            <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t('resources.page_title')}</h1>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('resources.page_subtitle')}</p>
                </div>
                {isAdmin && (
                    <Button onClick={() => setEdit({ mode: 'create' })} data-testid="resources-add" className="shrink-0">
                        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                        {t('resources.add_button')}
                    </Button>
                )}
            </header>

            {/* Toolbar */}
            <div className="mb-4 flex flex-wrap items-end gap-3">
                <div className="flex w-full flex-col gap-1 sm:w-72">
                    <span className="text-xs text-muted-foreground">{t('resources.search_placeholder')}</span>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input
                            type="search"
                            value={rawSearch}
                            onChange={(e) => setRawSearch(e.target.value)}
                            placeholder={t('resources.search_placeholder')}
                            aria-label={t('resources.search_placeholder')}
                            data-testid="resources-search"
                            className="bg-card pl-9 pr-9"
                        />
                        {rawSearch && (
                            <button
                                type="button"
                                onClick={() => setRawSearch('')}
                                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-card-foreground"
                                aria-label={t('common.clear')}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="flex w-full flex-col gap-1 sm:w-48">
                    <span className="text-xs text-muted-foreground">{t('resources.filter_kind_label')}</span>
                    <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as ResourceKind | typeof ALL_KINDS)}>
                        <SelectTrigger className="w-full bg-card" data-testid="resources-filter-kind">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value={ALL_KINDS}>{t('resources.filters.all')}</SelectItem>
                            {RESOURCE_KINDS.map((k) => (
                                <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="resources-table">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('resources.col_name')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('resources.col_kind')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('resources.col_url')}</th>
                                <th scope="col" className="px-4 py-2 text-left font-semibold">{t('resources.col_updated')}</th>
                                {isAdmin && <th scope="col" className="px-4 py-2 text-right font-semibold sr-only">{t('resources.col_actions')}</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">
                                    <Loader2 className="mx-auto h-5 w-5 animate-spin" aria-hidden="true" />
                                </td></tr>
                            ) : error ? (
                                <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-red-600">{error.message}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={isAdmin ? 5 : 4} className="px-4 py-8 text-center text-muted-foreground">
                                    {search || kindFilter !== ALL_KINDS ? t('resources.empty_search') : t('resources.empty')}
                                </td></tr>
                            ) : (
                                rows.map(({ resource, kindInfo }) => {
                                    const Icon = KIND_ICONS[kindInfo.iconName] ?? Globe;
                                    return (
                                        <tr key={resource.id} className="border-t border-border hover:bg-slate-50" data-testid={`resources-row-${resource.id}`}>
                                            <td className="px-4 py-2 font-medium text-slate-900">{resource.name}</td>
                                            <td className="px-4 py-2">
                                                <span className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                                    {t(`resources.kinds.${kindInfo.kind}`)}
                                                </span>
                                            </td>
                                            <td className="max-w-xs truncate px-4 py-2">
                                                <a
                                                    href={safeUrl(resource.url)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                                                >
                                                    <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
                                                    <span className="truncate">{resource.url}</span>
                                                </a>
                                            </td>
                                            <td className="px-4 py-2 text-muted-foreground">{resource.updated_at ? formatDisplayDate(resource.updated_at) : '—'}</td>
                                            {isAdmin && (
                                                <td className="px-4 py-2">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setEdit({ mode: 'edit', resource })}
                                                            aria-label={t('resources.form_edit_title')}
                                                            data-testid={`resources-edit-${resource.id}`}
                                                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                                        >
                                                            <Pencil className="h-4 w-4" aria-hidden="true" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(resource)}
                                                            aria-label={t('resources.delete_button')}
                                                            data-testid={`resources-delete-${resource.id}`}
                                                            className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                                        >
                                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isAdmin && edit && (
                <ResourceFormDialog
                    key={edit.mode === 'edit' ? edit.resource.id : 'create'}
                    edit={edit}
                    saving={createMutation.isPending || updateMutation.isPending}
                    onClose={() => setEdit(null)}
                    onSubmit={async ({ name, url }) => {
                        try {
                            if (edit.mode === 'create') {
                                if (!user?.id) { toast.error(t('resources.toast_error')); return; }
                                await createMutation.mutateAsync({ name, url, userId: user.id });
                                toast.success(t('resources.toast_created'));
                            } else {
                                await updateMutation.mutateAsync({ id: edit.resource.id, name, url });
                                toast.success(t('resources.toast_updated'));
                            }
                            setEdit(null);
                        } catch {
                            toast.error(t('resources.toast_error'));
                        }
                    }}
                />
            )}
        </div>
    );
}

interface ResourceFormDialogProps {
    edit: NonNullable<EditState>;
    saving: boolean;
    onClose: () => void;
    onSubmit: (values: { name: string; url: string }) => void;
}

function ResourceFormDialog({ edit, saving, onClose, onSubmit }: ResourceFormDialogProps) {
    const { t } = useTranslation();
    const initial = edit.mode === 'edit' ? edit.resource : null;
    const [name, setName] = useState(initial?.name ?? '');
    const [url, setUrl] = useState(initial?.url ?? '');
    const [touched, setTouched] = useState(false);

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    const kindInfo = detectResourceKind(trimmedUrl);
    const PreviewIcon = KIND_ICONS[kindInfo.iconName] ?? Globe;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setTouched(true);
        if (!trimmedName || !trimmedUrl) return;
        onSubmit({ name: trimmedName, url: trimmedUrl });
    };

    return (
        <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
            <DialogContent data-testid="resources-form-dialog" className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{edit.mode === 'create' ? t('resources.form_create_title') : t('resources.form_edit_title')}</DialogTitle>
                    <DialogDescription>{t('resources.form_description')}</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="resource-name">{t('resources.form_name_label')}</Label>
                        <Input
                            id="resource-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('resources.form_name_placeholder')}
                            data-testid="resources-form-name"
                        />
                        {touched && !trimmedName && <span className="text-xs text-red-600">{t('resources.form_name_required')}</span>}
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="resource-url">{t('resources.form_url_label')}</Label>
                        <Input
                            id="resource-url"
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://…"
                            data-testid="resources-form-url"
                        />
                        {touched && !trimmedUrl && <span className="text-xs text-red-600">{t('resources.form_url_required')}</span>}
                        {trimmedUrl && (
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <PreviewIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('resources.form_detected_kind', { kind: t(`resources.kinds.${kindInfo.kind}`) })}
                            </span>
                        )}
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={saving || !trimmedName || !trimmedUrl} data-testid="resources-form-save">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : (edit.mode === 'create' ? t('resources.form_create_submit') : t('resources.form_save'))}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
