import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { toIsoDate, nowUtcIso } from '@/shared/lib/date-engine';
import { TaskUpdate, TaskInsert } from '@/shared/db/app.types';

export interface CreateProjectPayload {
    title: string;
    description?: string;
    start_date?: string | Date;
    templateId?: string;
}

export interface UpdateProjectPayload {
    projectId: string;
    updates: TaskUpdate;
}

export function useCreateProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (formData: CreateProjectPayload) => {
            const user = await planter.auth.me();
            if (!user) throw new Error('User not authenticated');

            const projectStartDate = toIsoDate(formData.start_date);

            if (formData.templateId) {
                const cloneOverrides: Partial<Pick<TaskInsert, 'title' | 'description' | 'start_date' | 'due_date'>> = {
                    title: formData.title,
                    description: formData.description,
                };
                if (projectStartDate) {
                    cloneOverrides.start_date = projectStartDate;
                }

                const { data: newTasks, error: cloneError } = await planter.entities.Task.clone(
                    formData.templateId,
                    null,
                    'instance',
                    user.id,
                    cloneOverrides,
                );
                if (cloneError) throw cloneError;
                const rootClone = Array.isArray(newTasks) ? newTasks[0] : newTasks;
                return rootClone;
            } else {
                const project = await planter.entities.Project.create({
                    title: formData.title,
                    description: formData.description ?? undefined,
                    start_date: projectStartDate ?? undefined,
                    creator: user.id
                });

                return project;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['userProjects'] });
            queryClient.invalidateQueries({ queryKey: ['allTasks'] });
        }
    });
}

export function useUpdateProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ projectId, updates }: UpdateProjectPayload) => {
            // Normalize start_date / due_date to YYYY-MM-DD ISO. Raw form values
            // are already in that shape, but `toIsoDate` defends against Date
            // objects, trailing whitespace, or timezone-shifted ISO strings.
            const newStartIso = toIsoDate(updates.start_date);
            const newDueIso = toIsoDate(updates.due_date);

            const dbUpdates: TaskUpdate = {
                title: updates.title,
                description: updates.description,
                due_date: newDueIso ?? updates.due_date,
                start_date: newStartIso ?? updates.start_date,
                updated_at: nowUtcIso(),
                settings: updates.settings,
                status: updates.status,
                supervisor_email: updates.supervisor_email,
            };

            // The DB trigger `trg_waterfall_recompute` cascades dates across
            // every descendant whenever start_date / parent_task_id / position /
            // days_from_start changes. The client no longer recomputes anything.
            await planter.entities.Project.update(projectId, dbUpdates);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['userProjects'], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['project', variables.projectId], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['projectHierarchy', variables.projectId], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['allTasks'], refetchType: 'active' });
        }
    });
}

export function useDeleteProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (projectId: string) => {
            const { error } = await planter.rpc('delete_task', { p_task_id: projectId });
            if (error) throw error;
            return true;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['userProjects'] });
            queryClient.invalidateQueries({ queryKey: ['allTasks'] });
        }
    });
}

export function useSetProjectArchived() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ projectId, archived }: { projectId: string, archived: boolean }) => (
            planter.entities.Project.update(projectId, {
                status: archived ? 'archived' : 'in_progress',
            })
        ),
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['userProjects'] });
            queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] });
        }
    });
}
