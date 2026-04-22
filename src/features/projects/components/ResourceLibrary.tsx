import { useState, useMemo } from 'react';
import { ExternalLink, FileText, StickyNote, Search, BookOpen } from 'lucide-react';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/lib/utils';
import { safeUrl } from '@/shared/lib/safe-url';
import { useProjectResources } from '@/features/projects/hooks/useProjectResources';
import type { ResourceWithTask } from '@/shared/db/app.types';

// ---------------------------------------------------------------------------
// Type helpers (mirrors TaskResources.tsx)
// ---------------------------------------------------------------------------

type ResourceType = 'url' | 'pdf' | 'text';

const resourceTypeIcons: Record<ResourceType, React.ElementType> = {
    url: ExternalLink,
    pdf: FileText,
    text: StickyNote,
};

const resourceTypeLabels: Record<ResourceType, string> = {
    url: 'External Link',
    pdf: 'Document',
    text: 'Note',
};

// ---------------------------------------------------------------------------
// Filter tab definitions
// ---------------------------------------------------------------------------

type FilterTab = 'all' | ResourceType;

const FILTER_TABS: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'url', label: 'Links' },
    { id: 'pdf', label: 'Documents' },
    { id: 'text', label: 'Notes' },
];

// ---------------------------------------------------------------------------
// Resource card
// ---------------------------------------------------------------------------

function ResourceCard({ resource }: { resource: ResourceWithTask }) {
    const type = (resource.resource_type ?? 'url') as ResourceType;
    const Icon = resourceTypeIcons[type] ?? FileText;
    const label = resourceTypeLabels[type] ?? type;
    const taskTitle = resource.task?.title ?? 'Unknown task';

    return (
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card hover:border-brand-300 transition-colors">
            <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
                <Icon className="w-4 h-4 text-muted-foreground" />
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-card-foreground">{label}</p>

                {type === 'url' && resource.resource_url && (
                    <a
                        href={safeUrl(resource.resource_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:underline truncate block mt-0.5"
                    >
                        {resource.resource_url}
                    </a>
                )}

                {type === 'text' && resource.resource_text && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {resource.resource_text}
                    </p>
                )}

                {type === 'pdf' && resource.storage_path && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{resource.storage_path}</p>
                )}

                <p className="text-xs text-slate-400 mt-1.5">
                    From: <span className="font-medium text-slate-500">{taskTitle}</span>
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface ResourceLibraryProps {
    projectId: string;
}

export default function ResourceLibrary({ projectId }: ResourceLibraryProps) {
    const { data: resources = [], isLoading } = useProjectResources(projectId);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        return resources.filter((r: ResourceWithTask) => {
            // Type filter
            if (activeFilter !== 'all' && r.resource_type !== activeFilter) return false;

            // Search filter
            if (q) {
                const haystack = [
                    r.resource_url ?? '',
                    r.resource_text ?? '',
                    r.storage_path ?? '',
                    r.task?.title ?? '',
                ]
                    .join(' ')
                    .toLowerCase();
                if (!haystack.includes(q)) return false;
            }

            return true;
        });
    }, [resources, search, activeFilter]);

    return (
        <div className="space-y-6">
            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Search resources…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <div className="flex gap-1 p-1 bg-muted rounded-lg">
                    {FILTER_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveFilter(tab.id)}
                            className={cn(
                                'px-3 py-1 text-sm rounded-md transition-colors font-medium',
                                activeFilter === tab.id
                                    ? 'bg-white text-brand-700 shadow-sm'
                                    : 'text-muted-foreground hover:text-slate-700',
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Resource list */}
            {isLoading ? (
                <div className="flex justify-center py-16">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BookOpen className="w-10 h-10 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">
                        {resources.length === 0
                            ? 'No resources in this project yet'
                            : 'No resources match your search'}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">
                        {resources.length === 0
                            ? 'Add links, documents, or notes to tasks to see them here.'
                            : 'Try adjusting your search or filter.'}
                    </p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {filtered.map((resource: ResourceWithTask) => (
                        <ResourceCard key={resource.id} resource={resource} />
                    ))}
                </div>
            )}

            {/* Count footer */}
            {!isLoading && filtered.length > 0 && (
                <p className="text-xs text-slate-400 text-right">
                    {filtered.length} {filtered.length === 1 ? 'resource' : 'resources'}
                    {activeFilter !== 'all' || search ? ` matching` : ' total'}
                </p>
            )}
        </div>
    );
}
