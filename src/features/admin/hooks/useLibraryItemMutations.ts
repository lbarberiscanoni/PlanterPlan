import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { TaskInsert, TaskRow, LibraryItemType } from '@/shared/db/app.types';

export interface CreateLibraryItemPayload {
    title: string;
    description: string;
    taskType: LibraryItemType;
    daysFromStart: number | null;
    userId: string;
}

export interface UpdateLibraryItemPayload {
    id: string;
    title: string;
    description: string;
    taskType: LibraryItemType;
    daysFromStart: number | null;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
    queryClient.invalidateQueries({ queryKey: ['adminLibraryItems'] });
}

/**
 * Create a loose Master Library item — a template row with no parent that
 * carries an explicit phase/milestone/task type (preserved by the
 * `set_task_type` trigger). Writes go through the admin-only template RLS.
 */
export function useCreateLibraryItem(): UseMutationResult<TaskRow, Error, CreateLibraryItemPayload> {
    const queryClient = useQueryClient();
    return useMutation<TaskRow, Error, CreateLibraryItemPayload>({
        mutationFn: async (data) => {
            const insert = {
                title: data.title,
                description: data.description,
                origin: 'template',
                parent_task_id: null,
                root_id: null,
                task_type: data.taskType,
                status: 'planning',
                creator: data.userId,
                assignee_id: data.userId,
                days_from_start: data.daysFromStart ?? 0,
                settings: { library_loose: true },
            } satisfies TaskInsert;
            return planter.entities.Task.create(insert);
        },
        onSuccess: () => invalidate(queryClient),
    });
}

/** Edit a Master Library item. Changes apply to *future* copies only — existing clones are independent rows. */
export function useUpdateLibraryItem(): UseMutationResult<TaskRow, Error, UpdateLibraryItemPayload> {
    const queryClient = useQueryClient();
    return useMutation<TaskRow, Error, UpdateLibraryItemPayload>({
        mutationFn: async (data) => {
            return planter.entities.Task.update(data.id, {
                title: data.title,
                description: data.description,
                task_type: data.taskType,
                days_from_start: data.daysFromStart ?? 0,
            });
        },
        onSuccess: () => invalidate(queryClient),
    });
}

/** Remove a Master Library item. Existing project copies are unaffected (`cloned_from_task_id` is ON DELETE SET NULL). */
export function useDeleteLibraryItem(): UseMutationResult<boolean, Error, string> {
    const queryClient = useQueryClient();
    return useMutation<boolean, Error, string>({
        mutationFn: async (id) => planter.entities.Task.delete(id),
        onSuccess: () => invalidate(queryClient),
    });
}
