import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type {
    AdminListUserRow,
    AdminListUsersFilter,
    AdminUserDetail,
} from '@/shared/db/app.types';

/**
 * Wave 34 Task 2: paginated user list with server-side filters. The hook wraps
 * the `admin_list_users` RPC and keys by the filter shape so every filter
 * change invalidates + refetches.
 */
export function useAdminUsers(
    filter: AdminListUsersFilter,
    opts: { limit?: number; offset?: number } = {},
): UseQueryResult<AdminListUserRow[], Error> {
    const { limit = 50, offset = 0 } = opts;
    return useQuery<AdminListUserRow[], Error>({
        queryKey: ['adminUsers', filter, limit, offset],
        queryFn: () => planter.admin.listUsers(filter, limit, offset),
        staleTime: 30_000,
    });
}

/** Wave 34 Task 2: single-user drill-down (profile + project memberships + task counts). */
export function useAdminUserDetail(uid: string | null | undefined): UseQueryResult<AdminUserDetail | null, Error> {
    return useQuery<AdminUserDetail | null, Error>({
        queryKey: ['adminUserDetail', uid],
        queryFn: () => planter.admin.userDetail(uid as string),
        enabled: typeof uid === 'string' && uid.length > 0,
    });
}
