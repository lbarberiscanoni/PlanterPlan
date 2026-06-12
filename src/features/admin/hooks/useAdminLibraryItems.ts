import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type {
    AdminLibraryItemRow,
    AdminLibraryItemsFilter,
    AdminLibraryTemplateOption,
} from '@/shared/db/app.types';

/**
 * Master Library — paginated, filterable list of every template-origin item.
 * Wraps the `admin_library_items` RPC; keys by the filter shape so every
 * filter change invalidates + refetches. Mirrors `useAdminUsers`.
 */
export function useAdminLibraryItems(
    filter: AdminLibraryItemsFilter,
    opts: { limit?: number; offset?: number } = {},
): UseQueryResult<AdminLibraryItemRow[], Error> {
    const { limit = 200, offset = 0 } = opts;
    return useQuery<AdminLibraryItemRow[], Error>({
        queryKey: ['adminLibraryItems', filter, limit, offset],
        queryFn: () => planter.admin.listLibraryItems(filter, limit, offset),
        staleTime: 30_000,
    });
}

/** Master Library — project-template roots for the template filter dropdown. */
export function useAdminLibraryTemplates(): UseQueryResult<AdminLibraryTemplateOption[], Error> {
    return useQuery<AdminLibraryTemplateOption[], Error>({
        queryKey: ['adminLibraryTemplates'],
        queryFn: () => planter.admin.listLibraryTemplates(),
        staleTime: 60_000,
    });
}
