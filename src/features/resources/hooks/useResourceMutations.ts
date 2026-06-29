import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { ResourceRow, ResourceInsert } from '@/shared/db/app.types';

function invalidate(queryClient: QueryClient) {
    // Covers both ['resources','approved'] (catalog) and ['resources','pending']
    // (admin review queue).
    queryClient.invalidateQueries({ queryKey: ['resources'] });
}

export interface CreateResourcePayload {
    name: string;
    url: string;
    userId: string;
}

/** Create a catalog resource (admin-only — enforced by RLS). Goes in approved. */
export function useCreateResource() {
    const queryClient = useQueryClient();
    return useMutation<ResourceRow, Error, CreateResourcePayload>({
        mutationFn: ({ name, url, userId }) =>
            planter.entities.Resource.create({ name, url, created_by: userId, status: 'approved' } satisfies ResourceInsert),
        onSuccess: () => invalidate(queryClient),
    });
}

/**
 * Submit a resource suggestion (any authenticated user). RLS pins it to
 * `status='pending'` and `created_by=self`; it stays out of the catalog until
 * an admin approves it.
 */
export function useSubmitResource() {
    const queryClient = useQueryClient();
    return useMutation<ResourceRow, Error, CreateResourcePayload>({
        mutationFn: ({ name, url, userId }) =>
            planter.entities.Resource.create({ name, url, created_by: userId, status: 'pending' } satisfies ResourceInsert),
        onSuccess: () => invalidate(queryClient),
    });
}

/** Approve a pending submission (admin-only) — moves it into the catalog. */
export function useApproveResource() {
    const queryClient = useQueryClient();
    return useMutation<ResourceRow, Error, string>({
        mutationFn: (id) => planter.entities.Resource.update(id, { status: 'approved' }),
        onSuccess: () => invalidate(queryClient),
    });
}

export interface UpdateResourcePayload {
    id: string;
    name: string;
    url: string;
}

/** Edit a catalog resource (admin-only). */
export function useUpdateResource() {
    const queryClient = useQueryClient();
    return useMutation<ResourceRow, Error, UpdateResourcePayload>({
        mutationFn: ({ id, name, url }) => planter.entities.Resource.update(id, { name, url }),
        onSuccess: () => invalidate(queryClient),
    });
}

/** Remove a catalog resource (admin-only). Task attachments are unaffected. */
export function useDeleteResource() {
    const queryClient = useQueryClient();
    return useMutation<boolean, Error, string>({
        mutationFn: (id) => planter.entities.Resource.delete(id),
        onSuccess: () => invalidate(queryClient),
    });
}
