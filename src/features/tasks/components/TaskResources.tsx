import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TaskResourceRow, ResourceRow } from '@/shared/db/app.types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import {
    ExternalLink, FileText, StickyNote, Plus, Trash2, Star, Search,
    Sheet, Presentation, HardDrive, Video, Globe, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { safeUrl } from '@/shared/lib/safe-url';
import { planter } from '@/shared/api/planterClient';
import { detectResourceKind } from '@/shared/lib/resource-kind';

const resourceTypeIcons = {
    url: ExternalLink,
    pdf: FileText,
    text: StickyNote,
} as const;

const resourceTypeLabelKeys = {
    url: 'projects.resources.types.url',
    pdf: 'projects.resources.types.pdf',
    text: 'projects.resources.types.text',
} as const;

const KIND_ICONS: Record<string, LucideIcon> = {
    FileText, Sheet, Presentation, HardDrive, Video, Globe, ExternalLink,
};

type ResourceType = keyof typeof resourceTypeIcons;
type AddMode = 'catalog' | 'custom';

function normalizeResourceType(type: string | null | undefined): ResourceType {
    return type === 'pdf' || type === 'text' || type === 'url' ? type : 'url';
}

/** Icon for a task resource — derived from the URL for links, type-based otherwise. */
function resourceIcon(resource: TaskResourceRow): LucideIcon {
    const type = normalizeResourceType(resource.resource_type);
    if (type === 'url') {
        return KIND_ICONS[detectResourceKind(resource.resource_url).iconName] ?? ExternalLink;
    }
    return resourceTypeIcons[type] ?? FileText;
}

interface TaskResourcesProps {
    taskId: string;
    primaryResourceId?: string | null;
    onUpdate?: () => void;
}

interface CreateResourceInput {
    resource_type: ResourceType;
    resource_url?: string | null;
    resource_text?: string | null;
    storage_path?: string | null;
    name?: string | null;
    resource_id?: string | null;
}

const EMPTY_FORM = { type: 'url' as ResourceType, resource_url: '', resource_text: '', storage_path: '', name: '' };

export default function TaskResources({ taskId, primaryResourceId, onUpdate }: TaskResourcesProps) {
    const { t } = useTranslation();
    const [showAddModal, setShowAddModal] = useState(false);
    const [mode, setMode] = useState<AddMode>('catalog');
    const [catalogSearch, setCatalogSearch] = useState('');
    const [formData, setFormData] = useState(EMPTY_FORM);

    const queryClient = useQueryClient();

    const { data: resources = [] } = useQuery<TaskResourceRow[]>({
        queryKey: ['taskResources', taskId],
        queryFn: () => planter.entities.TaskResource.filter({ task_id: taskId }),
        enabled: !!taskId,
    });

    // The global catalog (admin-curated). Loaded only while the dialog's catalog
    // tab is open; filtered client-side (the catalog is small).
    const { data: catalog = [] } = useQuery<ResourceRow[]>({
        queryKey: ['resources'],
        queryFn: ({ signal }) => planter.entities.Resource.list({ signal }),
        enabled: showAddModal && mode === 'catalog',
        staleTime: 30_000,
    });
    const catalogMatches = useMemo(() => {
        const q = catalogSearch.trim().toLowerCase();
        return catalog
            .filter((r) => !q || (r.name ?? '').toLowerCase().includes(q) || (r.url ?? '').toLowerCase().includes(q))
            .slice(0, 40);
    }, [catalog, catalogSearch]);

    const closeModal = () => {
        setShowAddModal(false);
        setMode('catalog');
        setCatalogSearch('');
        setFormData(EMPTY_FORM);
    };

    const createResourceMutation = useMutation({
        mutationFn: (data: CreateResourceInput) =>
            planter.entities.TaskResource.create({
                task_id: taskId,
                resource_type: data.resource_type,
                resource_url: data.resource_url ?? null,
                resource_text: data.resource_text ?? null,
                storage_path: data.storage_path ?? null,
                storage_bucket: null,
                name: data.name ?? null,
                resource_id: data.resource_id ?? null,
            }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taskResources', taskId] });
            closeModal();
            if (onUpdate) onUpdate();
        },
    });

    const deleteResourceMutation = useMutation({
        mutationFn: (id: string) => planter.entities.TaskResource.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['taskResources', taskId] });
            if (onUpdate) onUpdate();
        },
    });

    const setPrimaryMutation = useMutation({
        mutationFn: (id: string) => planter.entities.TaskResource.setPrimary(taskId, id === primaryResourceId ? null : id),
        onSuccess: () => {
            if (onUpdate) onUpdate();
        },
    });

    const handleCustomSubmit = (e: FormEvent) => {
        e.preventDefault();
        createResourceMutation.mutate({
            resource_type: formData.type,
            resource_url: formData.resource_url || null,
            resource_text: formData.resource_text || null,
            storage_path: formData.storage_path || null,
            name: formData.name.trim() || null,
        });
    };

    const attachFromCatalog = (r: ResourceRow) => {
        createResourceMutation.mutate({
            resource_type: 'url',
            resource_url: r.url,
            name: r.name,
            resource_id: r.id,
        });
    };

    return (
        <div data-testid="task-resources">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-card-foreground uppercase tracking-wider">{t('projects.resources.title')}</h4>
                <Button
                    size="sm"
                    onClick={() => setShowAddModal(true)}
                    className="bg-brand-500 hover:bg-brand-600 text-white"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    {t('projects.resources.add_button')}
                </Button>
            </div>

            <div className="space-y-2">
                {resources.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('projects.resources.empty')}</p>
                ) : (
                    resources.map((resource) => {
                        const type = normalizeResourceType(resource.resource_type);
                        const Icon = resourceIcon(resource);
                        const isPrimary = primaryResourceId === resource.id;
                        const displayName = resource.name || t(resourceTypeLabelKeys[type]);

                        return (
                            <div
                                key={resource.id}
                                className={cn(
                                    'flex items-center justify-between p-3 rounded-lg border transition-all',
                                    isPrimary
                                        ? 'bg-brand-50 border-brand-300 '
                                        : 'bg-card border-border hover:border-brand-300'
                                )}
                            >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <div
                                        className={cn(
                                            'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                                            isPrimary ? 'bg-brand-500' : 'bg-muted/50'
                                        )}
                                    >
                                        <Icon className={cn('w-4 h-4', isPrimary ? 'text-white' : 'text-muted-foreground')} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-card-foreground truncate">
                                            {displayName}
                                        </p>
                                        {type === 'url' && resource.resource_url && (
                                            <a
                                                href={safeUrl(resource.resource_url)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-brand-600 hover:underline truncate block"
                                            >
                                                {resource.resource_url}
                                            </a>
                                        )}
                                        {type === 'text' && resource.resource_text && (
                                            <p className="text-xs text-muted-foreground truncate">
                                                {resource.resource_text.substring(0, 50)}...
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setPrimaryMutation.mutate(resource.id)}
                                        aria-label={t(isPrimary ? 'projects.resources.unset_primary_aria' : 'projects.resources.set_primary_aria', { type: displayName })}
                                        className={cn('h-8 w-8', isPrimary && 'text-brand-600 hover:text-brand-700')}
                                    >
                                        <Star className={cn('w-4 h-4', isPrimary && 'fill-brand-600')} />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => deleteResourceMutation.mutate(resource.id)}
                                        aria-label={t('projects.resources.delete_aria', { type: displayName })}
                                        className="h-8 w-8 text-rose-600 hover:bg-rose-50 "
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <Dialog open={showAddModal} onOpenChange={(next) => { if (!next) closeModal(); }}>
                <DialogContent className="sm:max-w-md bg-card text-card-foreground">
                    <DialogHeader>
                        <DialogTitle>{t('projects.resources.add_modal_title')}</DialogTitle>
                        <DialogDescription>{t('projects.resources.add_modal_description')}</DialogDescription>
                    </DialogHeader>

                    {/* Source toggle: attach from the global catalog vs. a one-off custom link. */}
                    <div className="flex rounded-lg bg-muted p-1 text-sm">
                        <button
                            type="button"
                            onClick={() => setMode('catalog')}
                            data-testid="resource-mode-catalog"
                            className={cn('flex-1 rounded-md px-3 py-1.5 font-medium transition-colors', mode === 'catalog' ? 'bg-card shadow text-card-foreground' : 'text-muted-foreground')}
                        >
                            {t('projects.resources.source_catalog')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('custom')}
                            data-testid="resource-mode-custom"
                            className={cn('flex-1 rounded-md px-3 py-1.5 font-medium transition-colors', mode === 'custom' ? 'bg-card shadow text-card-foreground' : 'text-muted-foreground')}
                        >
                            {t('projects.resources.source_custom')}
                        </button>
                    </div>

                    {mode === 'catalog' ? (
                        <div className="space-y-3">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                                <Input
                                    value={catalogSearch}
                                    onChange={(e) => setCatalogSearch(e.target.value)}
                                    placeholder={t('projects.resources.catalog_search_placeholder')}
                                    data-testid="resource-catalog-search"
                                    className="pl-9"
                                    autoFocus
                                />
                            </div>
                            <div className="max-h-64 space-y-1 overflow-y-auto">
                                {catalogMatches.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-muted-foreground">{t('projects.resources.no_catalog_matches')}</p>
                                ) : (
                                    catalogMatches.map((r) => {
                                        const CatIcon = KIND_ICONS[detectResourceKind(r.url).iconName] ?? Globe;
                                        return (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => attachFromCatalog(r)}
                                                disabled={createResourceMutation.isPending}
                                                data-testid={`resource-catalog-item-${r.id}`}
                                                className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-50"
                                            >
                                                <CatIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-sm font-medium text-card-foreground">{r.name}</span>
                                                    <span className="block truncate text-xs text-muted-foreground">{r.url}</span>
                                                </span>
                                                <Plus className="h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden="true" />
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleCustomSubmit} className="space-y-4">
                            <div>
                                <Label>{t('projects.resources.name_label')}</Label>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t('projects.resources.name_placeholder')}
                                    data-testid="resource-custom-name"
                                />
                            </div>
                            <div>
                                <Label>{t('projects.resources.resource_type_label')}</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={(value) => setFormData({ ...formData, type: value as ResourceType })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="url">{t(resourceTypeLabelKeys.url)}</SelectItem>
                                        <SelectItem value="text">{t(resourceTypeLabelKeys.text)}</SelectItem>
                                        <SelectItem value="pdf">{t(resourceTypeLabelKeys.pdf)}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {formData.type === 'url' && (
                                <div>
                                    <Label>{t('projects.resources.url_label')}</Label>
                                    <Input
                                        type="url"
                                        value={formData.resource_url}
                                        onChange={(e) => setFormData({ ...formData, resource_url: e.target.value })}
                                        placeholder={t('projects.resources.url_placeholder')}
                                        required
                                    />
                                </div>
                            )}

                            {formData.type === 'text' && (
                                <div>
                                    <Label>{t('projects.resources.content_label')}</Label>
                                    <Textarea
                                        value={formData.resource_text}
                                        onChange={(e) => setFormData({ ...formData, resource_text: e.target.value })}
                                        placeholder={t('projects.resources.content_placeholder')}
                                        rows={4}
                                        required
                                    />
                                </div>
                            )}

                            {formData.type === 'pdf' && (
                                <div>
                                    <Label>{t('projects.resources.storage_path_label')}</Label>
                                    <Input
                                        value={formData.storage_path}
                                        onChange={(e) => setFormData({ ...formData, storage_path: e.target.value })}
                                        placeholder={t('projects.resources.storage_path_placeholder')}
                                        required
                                    />
                                </div>
                            )}

                            <div className="flex gap-2 justify-end pt-4">
                                <Button type="button" variant="outline" onClick={closeModal}>
                                    {t('common.cancel')}
                                </Button>
                                <Button type="submit" disabled={createResourceMutation.isPending} className="bg-brand-500 hover:bg-brand-600 text-white">
                                    {t('projects.resources.add_button')}
                                </Button>
                            </div>
                        </form>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
