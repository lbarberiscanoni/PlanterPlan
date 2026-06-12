import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { AdminListProjectRow, AdminListProjectsFilter } from '@/shared/db/app.types';

/**
 * Admin "Manage Projects" — paginated instance project roots with server-side
 * filters. Wraps `admin_list_projects`; keys by filter so changes refetch.
 */
export function useAdminProjects(
    filter: AdminListProjectsFilter,
    opts: { limit?: number; offset?: number } = {},
): UseQueryResult<AdminListProjectRow[], Error> {
    const { limit = 50, offset = 0 } = opts;
    return useQuery<AdminListProjectRow[], Error>({
        queryKey: ['adminProjects', filter, limit, offset],
        queryFn: () => planter.admin.listProjects(filter, limit, offset),
        staleTime: 30_000,
    });
}
