import { useState, useMemo, useId, useCallback } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import useMasterLibrarySearch from '@/shared/hooks/useMasterLibrarySearch';
import useRelatedTemplates from '@/shared/hooks/useRelatedTemplates';
import { useAuth } from '@/shared/contexts/auth-context';
import { planter } from '@/shared/api/planterClient';
import type { TaskRow } from '@/shared/db/app.types';

interface TemplateSearchResult {
    id: string;
    title?: string | null;
    description?: string | null;
}

interface StrategyFollowUpDialogProps {
    /** The strategy-template task that just flipped to `completed`. */
    task: TaskRow;
    /** Whether the dialog is open. Parent owns the state so it can track "seen". */
    open: boolean;
    /** Close callback. The parent should also mark the task as "prompt shown" so
     *  the dialog doesn't reopen on the next cache refetch. */
    onOpenChange: (open: boolean) => void;
    /**
     * Templates that are already present under the same project — forwarded to
     * `MasterLibrarySearch` so the combobox hides them (Wave 22 dedupe convention).
     */
    excludeTemplateIds?: readonly string[];
}

function StrategyTemplateSearch({
    onSelect,
    excludeTemplateIds,
}: {
    onSelect: (selected: TemplateSearchResult) => void;
    excludeTemplateIds: readonly string[];
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const listboxId = useId();
    const { results, isLoading, hasResults, exclusionDrained } = useMasterLibrarySearch({
        query,
        excludeTemplateIds,
    });

    const handleQueryChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        setQuery(event.target.value);
        setIsOpen(true);
        setActiveIndex(-1);
    }, []);

    const handleSelect = useCallback((template: TemplateSearchResult) => {
        onSelect(template);
        setQuery(template.title ?? '');
        setIsOpen(false);
        setActiveIndex(-1);
    }, [onSelect]);

    const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((prev) => (
                results.length === 0 ? -1 : (prev + 1 >= results.length ? 0 : prev + 1)
            ));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((prev) => (prev - 1 < 0 ? results.length - 1 : prev - 1));
        } else if (event.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
            event.preventDefault();
            handleSelect(results[activeIndex]);
        } else if (event.key === 'Escape') {
            setIsOpen(false);
            setActiveIndex(-1);
        }
    }, [activeIndex, handleSelect, results]);

    const activeResultId = useMemo(() => {
        if (activeIndex < 0 || activeIndex >= results.length) return undefined;
        return `${listboxId}-item-${results[activeIndex].id}`;
    }, [activeIndex, listboxId, results]);

    return (
        <div className="relative space-y-1">
            <label
                className="block text-sm font-medium text-slate-600"
                htmlFor={`strategy-template-search-${listboxId}`}
            >
                {t('tasks.strategy_follow_up.search_label')}
            </label>
            <input
                id={`strategy-template-search-${listboxId}`}
                type="text"
                className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500 md:text-sm"
                placeholder={t('tasks.search.template_placeholder')}
                value={query}
                onChange={handleQueryChange}
                onFocus={() => setIsOpen(true)}
                onBlur={() => {
                    setTimeout(() => setIsOpen(false), 200);
                }}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-autocomplete="list"
                aria-controls={isOpen ? listboxId : undefined}
                aria-activedescendant={activeResultId}
                aria-expanded={isOpen && hasResults}
                aria-haspopup="listbox"
            />

            {isOpen && (
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={t('tasks.strategy_follow_up.search_results_aria')}
                    className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
                >
                    {isLoading && (
                        <div className="px-4 py-3 text-sm text-slate-500">
                            {t('tasks.strategy_follow_up.loading_templates')}
                        </div>
                    )}

                    {!isLoading && results.length === 0 && (
                        <div className="px-4 py-3 text-sm text-slate-500">
                            {exclusionDrained
                                ? t('tasks.strategy_follow_up.all_matching_added')
                                : query
                                    ? t('tasks.strategy_follow_up.no_matching_templates')
                                    : t('tasks.strategy_follow_up.no_templates_available')}
                        </div>
                    )}

                    {results.map((template, index) => {
                        const isActive = index === activeIndex;
                        return (
                            <button
                                key={template.id}
                                type="button"
                                id={`${listboxId}-item-${template.id}`}
                                role="option"
                                aria-selected={isActive}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleSelect(template)}
                                data-testid={`strategy-followup-search-row-${template.id}`}
                                className={`w-full text-left px-4 py-2.5 border-b border-slate-200 last:border-b-0 focus:outline-none ${
                                    isActive ? 'bg-brand-50' : 'hover:bg-slate-50'
                                }`}
                            >
                                <p className="text-sm font-medium text-slate-900 truncate">{template.title}</p>
                                {template.description && (
                                    <p className="text-xs text-slate-600 truncate mt-0.5">{template.description}</p>
                                )}
                                <span className="text-xs text-brand-600">
                                    {t('tasks.strategy_follow_up.copy_to_form')}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/**
 * Wave 24 — Strategy Template follow-up prompt. When an instance task flagged
 * `settings.is_strategy_template = true` transitions into `status = 'completed'`,
 * the parent (`TaskDetailsPanel` / `Project.tsx`) opens this dialog to let the
 * user pick one or more Master Library templates that will be cloned as
 * **sibling** tasks (same `parent_task_id` as the completed strategy task).
 *
 * Reuses `planter.entities.Task.clone` (which stamps `settings.spawnedFromTemplate`
 * on the cloned root for Wave 22 dedupe). Picks are non-blocking: the user may
 * select several in a row or dismiss without picking any.
 */
const StrategyFollowUpDialog = ({
    task,
    open,
    onOpenChange,
    excludeTemplateIds,
}: StrategyFollowUpDialogProps) => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
    const [clonedCount, setClonedCount] = useState(0);

    const parentId = task.parent_task_id ?? null;
    const rootId = task.root_id ?? task.id;

    const handleSelect = async (selected: TemplateSearchResult) => {
        if (!user?.id) {
            toast.error('Not signed in');
            return;
        }
        if (pendingTemplateId === selected.id) return;
        setPendingTemplateId(selected.id);
        try {
            const { error } = await planter.entities.Task.clone(
                selected.id,
                parentId,
                'instance',
                user.id,
            );
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] });
            setClonedCount((n) => n + 1);
            toast.success(`Added "${selected.title ?? 'Template'}" as a sibling task`);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            toast.error('Failed to add template', { description: message });
        } finally {
            setPendingTemplateId(null);
        }
    };

    const excludeSet = useMemo(() => excludeTemplateIds ?? [], [excludeTemplateIds]);

    const seedForRelated = useMemo(
        () => ({ id: task.id, title: task.title, description: task.description }),
        [task.id, task.title, task.description],
    );
    const hasSeedText = Boolean(task.title?.trim() || task.description?.trim());
    const { results: relatedResults, isLoading: relatedLoading } = useRelatedTemplates(
        seedForRelated,
        { excludeTemplateIds: excludeSet, limit: 5, enabled: open && hasSeedText },
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="max-w-lg"
                data-testid="strategy-followup-dialog"
            >
                <DialogHeader>
                    <DialogTitle>Add follow-up tasks</DialogTitle>
                    <DialogDescription>
                        You completed a strategy template. Pick one or more Master Library
                        templates to add as sibling tasks under the same parent.
                    </DialogDescription>
                </DialogHeader>
                {hasSeedText && (
                    <div
                        className="py-2"
                        data-testid="strategy-followup-related"
                    >
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Related templates
                        </p>
                        {relatedResults.length > 0 ? (
                            <ul className="flex flex-col gap-1" role="list">
                                {relatedResults.map((tmpl) => (
                                    <li key={tmpl.id}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                handleSelect({
                                                    id: tmpl.id,
                                                    title: tmpl.title ?? undefined,
                                                })
                                            }
                                            disabled={pendingTemplateId === tmpl.id}
                                            data-testid={`strategy-followup-related-row-${tmpl.id}`}
                                            className="flex w-full flex-col items-start rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            <span className="font-medium">{tmpl.title ?? 'Untitled template'}</span>
                                            {tmpl.description && (
                                                <span className="line-clamp-2 text-xs text-slate-500">
                                                    {tmpl.description}
                                                </span>
                                            )}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : relatedLoading ? (
                            <p className="text-xs text-slate-500">Finding related templates…</p>
                        ) : (
                            <p className="text-xs text-slate-500">No related templates found.</p>
                        )}
                    </div>
                )}
                <div className="py-2">
                    <StrategyTemplateSearch
                        onSelect={handleSelect}
                        excludeTemplateIds={excludeSet}
                    />
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        data-testid="strategy-followup-done"
                    >
                        {clonedCount > 0 ? 'Done' : 'Skip'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default StrategyFollowUpDialog;
