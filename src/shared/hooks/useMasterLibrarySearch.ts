import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { useAuth } from '@/shared/contexts/auth-context';
import { STALE_TIMES } from '@/shared/lib/react-query-config';

export interface UseMasterLibrarySearchProps {
 query?: string;
 enabled?: boolean;
 phasesOnly?: boolean;
 /**
  * Restrict results to a single hierarchy type. The visible-templates feed
  * returns every template ROOT, which mixes true project templates
  * (`task_type='project'`) with loose library items (`task_type='task'`, etc.).
  * Callers declare intent: `'project'` for "clone a whole template into a new
  * project" (so loose tasks don't masquerade as templates), or `'task'` /
  * `'phase'` for the "add an item to my project" picker (so whole templates
  * don't appear as task options). Undefined keeps the legacy unfiltered set.
  */
 taskType?: 'project' | 'phase' | 'milestone' | 'task';
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
 taskType,
 excludeTemplateIds,
}: UseMasterLibrarySearchProps = {}) => {
 const { user } = useAuth();
 const viewerId = user?.id;

 const { data: allTemplates, isLoading: rootsLoading, error: rootsError } = useQuery({
 queryKey: ['masterLibraryTemplates', viewerId],
 queryFn: () => planter.entities.TaskWithResources.listAllVisibleTemplates(viewerId),
 enabled,
 staleTime: STALE_TIMES.long,
 });

 // Reusable library items (phases / milestones / tasks) live NESTED inside
 // templates, so the "add an item to my project" picker must search template
 // DESCENDANTS — not roots. The 'project' picker (clone a whole template) and
 // the legacy unfiltered path stay on roots. Descendants are scoped to the
 // visible roots so visibility matches the clone picker.
 const wantsDescendants = !!taskType && taskType !== 'project';
 const visibleRootIds = useMemo(() => (allTemplates ?? []).map((t) => t.id), [allTemplates]);

 const { data: descendants, isLoading: descLoading, error: descError } = useQuery({
 queryKey: ['masterLibraryDescendants', viewerId, taskType, visibleRootIds],
 queryFn: () => planter.entities.TaskWithResources.listTemplateDescendants(visibleRootIds, taskType),
 enabled: enabled && wantsDescendants && visibleRootIds.length > 0,
 staleTime: STALE_TIMES.long,
 });

 const trimmed = query.trim().toLowerCase();

 const matchesQuery = (t: { title?: string | null; description?: string | null }) =>
 !trimmed || t.title?.toLowerCase().includes(trimmed) || t.description?.toLowerCase().includes(trimmed);

 const { results, exclusionDrained } = useMemo(() => {
 // Descendant path: server already scoped to origin/type/visible-roots, so
 // only exclude items from templates already cloned into the project, then
 // apply the text search.
 if (wantsDescendants) {
 if (!descendants) return { results: [], exclusionDrained: false };
 let filtered = descendants;
 const before = filtered.length;
 if (excludeTemplateIds && excludeTemplateIds.length > 0 && before > 0) {
 const exclusionSet = new Set(excludeTemplateIds);
 filtered = filtered.filter((t) => !(t.root_id && exclusionSet.has(t.root_id)));
 }
 const drained = before > 0 && filtered.length === 0;
 return { results: drained ? [] : filtered.filter(matchesQuery), exclusionDrained: drained };
 }

 // Roots path: taskType==='project' or the legacy phasesOnly/unfiltered case.
 if (!allTemplates) return { results: [], exclusionDrained: false };
 let filtered = allTemplates;
 if (taskType) {
 // Roots carry task_type; legacy roots may be NULL → treat as 'project'.
 filtered = filtered.filter((t) => (t.task_type ?? 'project') === taskType);
 } else if (phasesOnly) {
 filtered = filtered.filter((t) => t.parent_task_id && t.parent_task_id === t.root_id);
 }
 const before = filtered.length;
 if (excludeTemplateIds && excludeTemplateIds.length > 0 && before > 0) {
 const exclusionSet = new Set(excludeTemplateIds);
 filtered = filtered.filter((t) => !exclusionSet.has(t.id));
 }
 const drained = before > 0 && filtered.length === 0;
 return { results: drained ? [] : filtered.filter(matchesQuery), exclusionDrained: drained };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [wantsDescendants, descendants, allTemplates, trimmed, phasesOnly, taskType, excludeTemplateIds]);

 return {
 results,
 isLoading: wantsDescendants ? rootsLoading || descLoading : rootsLoading,
 error: rootsError ?? descError,
 hasResults: results.length > 0,
 exclusionDrained,
 };
};

export default useMasterLibrarySearch;
