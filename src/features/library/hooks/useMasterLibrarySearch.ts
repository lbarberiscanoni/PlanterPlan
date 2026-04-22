import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { useAuth } from '@/shared/contexts/AuthContext';
import { STALE_TIMES } from '@/shared/lib/react-query-config';

interface UseMasterLibrarySearchProps {
 query?: string;
 enabled?: boolean;
 phasesOnly?: boolean;
 /**
  * Template ids to hide from the results. Typically the set of
  * `settings.spawnedFromTemplate` values already present in the active
  * project, so users aren't offered a template they've already cloned.
  */
 excludeTemplateIds?: readonly string[];
}

export const useMasterLibrarySearch = ({
 query = '',
 enabled = true,
 phasesOnly = false,
 excludeTemplateIds,
}: UseMasterLibrarySearchProps = {}) => {
 const { user } = useAuth();
 const viewerId = user?.id;

 const { data: allTemplates, isLoading, error } = useQuery({
 queryKey: ['masterLibraryTemplates', viewerId],
 queryFn: () => planter.entities.TaskWithResources.listAllVisibleTemplates(viewerId),
 enabled,
 staleTime: STALE_TIMES.long,
 });

 const trimmed = query.trim().toLowerCase();

 const { results, exclusionDrained } = useMemo(() => {
 if (!allTemplates) return { results: [], exclusionDrained: false };
 let filtered = allTemplates;
 if (phasesOnly) {
 filtered = filtered.filter((t) => t.parent_task_id && t.parent_task_id === t.root_id);
 }

 const beforeExclusionCount = filtered.length;
 if (excludeTemplateIds && excludeTemplateIds.length > 0 && beforeExclusionCount > 0) {
 const exclusionSet = new Set(excludeTemplateIds);
 filtered = filtered.filter((t) => !exclusionSet.has(t.id));
 }
 const drainedByExclusion = beforeExclusionCount > 0 && filtered.length === 0;

 if (!trimmed) return { results: filtered, exclusionDrained: drainedByExclusion };
 const queryFiltered = filtered.filter(
 (t) => t.title?.toLowerCase().includes(trimmed) || t.description?.toLowerCase().includes(trimmed)
 );
 // `drainedByExclusion === true` already implies `filtered.length === 0`,
 // and therefore `queryFiltered.length === 0`, so no extra clause needed.
 return { results: queryFiltered, exclusionDrained: drainedByExclusion };
 }, [allTemplates, trimmed, phasesOnly, excludeTemplateIds]);

 return {
 results,
 isLoading,
 error,
 hasResults: results.length > 0,
 exclusionDrained,
 };
};

export default useMasterLibrarySearch;
