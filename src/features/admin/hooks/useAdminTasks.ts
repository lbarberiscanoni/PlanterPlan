import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { AdminListTaskRow, AdminListTasksFilter } from '@/shared/db/app.types';

/**
 * Admin "Manage Tasks" — paginated instance tasks with server-side filters.
 * Wraps `admin_list_tasks`; keys by filter so changes refetch.
 */
export function useAdminTasks(
    filter: AdminListTasksFilter,
    opts: { limit?: number; offset?: number } = {},
): UseQueryResult<AdminListTaskRow[], Error> {
    const { limit = 50, offset = 0 } = opts;
    return useQuery<AdminListTaskRow[], Error>({
        queryKey: ['adminTasks', filter, limit, offset],
        queryFn: () => planter.admin.listTasks(filter, limit, offset),
        staleTime: 30_000,
    });
}
