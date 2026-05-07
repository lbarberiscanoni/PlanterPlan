import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import type { TaskInsert, TaskRow } from '@/shared/db/app.types';
import type { Database } from '@/shared/db/database.types';

type ProjectMemberInsert = Database['public']['Tables']['project_members']['Insert'];

export interface CreateTemplatePayload {
    title: string;
    description: string;
    isPublished: boolean;
    userId: string;
}

/**
 * Creates a root template and owner membership through the shared API layer.
 *
 * @returns React Query mutation for creating a template root.
 */
export function useCreateTemplate() {
    const queryClient = useQueryClient();

    return useMutation<TaskRow, Error, CreateTemplatePayload>({
        mutationFn: async (data) => {
            const templateInsert = {
                title: data.title,
                description: data.description,
                origin: 'template',
                parent_task_id: null,
                root_id: null,
                status: 'planning',
                creator: data.userId,
                assignee_id: data.userId,
                settings: { published: data.isPublished },
            } satisfies TaskInsert;

            const template = await planter.entities.Task.create(templateInsert);
            if (!template?.id) {
                throw new Error('Template creation did not return an id');
            }

            const ownerMembership = {
                project_id: template.id,
                user_id: data.userId,
                role: 'owner',
            } satisfies ProjectMemberInsert;

            await planter.entities.TeamMember.create(ownerMembership);
            return template;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['projects', 'template'] });
        },
    });
}
