import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { ResourceRow } from '@/shared/db/app.types';

/**
 * Fetches the approved master resource catalog. Small + read by every
 * authenticated user, so we load it all and search/filter client-side
 * (see Resources page). Pending submissions are excluded here — they live in
 * the admin review queue (see usePendingResources).
 */
export function useResources() {
    return useQuery<ResourceRow[], Error>({
        queryKey: ['resources', 'approved'],
        queryFn: ({ signal }) => planter.entities.Resource.filter({ status: 'approved' }, { signal }),
        staleTime: 30_000,
    });
}

/**
 * Admin review queue: resources users have submitted, awaiting approval.
 * RLS returns these only to admins (and the submitter); gate the hook with
 * `enabled` so non-admins never fire the query.
 */
export function usePendingResources(enabled: boolean) {
    return useQuery<ResourceRow[], Error>({
        queryKey: ['resources', 'pending'],
        queryFn: ({ signal }) => planter.entities.Resource.filter({ status: 'pending' }, { signal }),
        enabled,
        staleTime: 15_000,
    });
}
