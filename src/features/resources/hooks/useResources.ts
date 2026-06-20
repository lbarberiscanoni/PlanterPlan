import { useQuery } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { ResourceRow } from '@/shared/db/app.types';

/**
 * Fetches the full admin-curated resource catalog. The catalog is small and
 * read by every authenticated user, so we load it all and search/filter
 * client-side (see Resources page).
 */
export function useResources() {
    return useQuery<ResourceRow[], Error>({
        queryKey: ['resources'],
        queryFn: ({ signal }) => planter.entities.Resource.list({ signal }),
        staleTime: 30_000,
    });
}
