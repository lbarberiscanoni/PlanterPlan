import { useMemo } from 'react';
import useMasterLibrarySearch from '@/shared/hooks/useMasterLibrarySearch';
import { rankRelated } from '@/shared/lib/related-templates';
import type { RankableTemplate } from '@/shared/lib/related-templates';

interface SeedTask {
    id: string;
    title?: string | null;
    description?: string | null;
}

interface UseRelatedTemplatesOptions {
    /** Template ids to hide (forwarded through `useMasterLibrarySearch`). */
    excludeTemplateIds?: readonly string[];
    /** Max suggestions to return. Defaults to 5. */
    limit?: number;
    /** Pass `false` to skip the fetch entirely (e.g. dialog closed). */
    enabled?: boolean;
}

/**
 * Hook driving related Master Library template suggestions. Reads the full
 * visible-template snapshot from `useMasterLibrarySearch`, then ranks
 * candidates by title/description similarity to the seed.
 */
export const useRelatedTemplates = (
    seedTask?: SeedTask | null,
    { excludeTemplateIds, limit = 5, enabled = true }: UseRelatedTemplatesOptions = {},
) => {
    const { results: allResults, isLoading } = useMasterLibrarySearch({
        query: '',
        enabled,
        excludeTemplateIds,
    });

    const results = useMemo(() => {
        if (!seedTask) return [];
        const hasAnyText = Boolean(seedTask.title?.trim() || seedTask.description?.trim());
        if (!hasAnyText) return [];
        return rankRelated<RankableTemplate>(
            seedTask,
            allResults as RankableTemplate[],
            limit,
        );
    }, [seedTask, allResults, limit]);

    return {
        results,
        isLoading,
        hasResults: results.length > 0,
    };
};

export default useRelatedTemplates;
