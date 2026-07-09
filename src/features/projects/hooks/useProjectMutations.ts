import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { toIsoDate, nowUtcIso } from '@/shared/lib/date-engine';
import { TaskUpdate, TaskInsert, TaskRow } from '@/shared/db/app.types';
import { track } from '@/shared/analytics/posthog';

/** Root-only `settings.project_kind`; defaults to 'date' when unset. */
function projectKindOf(root: TaskRow | null | undefined): 'date' | 'checkpoint' {
    return (root?.settings as { project_kind?: 'date' | 'checkpoint' } | null)?.project_kind ?? 'date';
}

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
                const taskCount = Array.isArray(newTasks) ? newTasks.length : newTasks ? 1 : 0;
                track('template_cloned', {
                    template_id: formData.templateId,
                    cloned_from_template_version: (rootClone?.settings as { cloned_from_template_version?: number } | null)?.cloned_from_template_version,
                    task_count: taskCount,
                });
                track('project_created', { project_kind: projectKindOf(rootClone), from_template: true });
                return rootClone;
            } else {
                const project = await planter.entities.Project.create({
                    title: formData.title,
                    description: formData.description ?? undefined,
                    start_date: projectStartDate ?? undefined,
                    creator: user.id
                });

                track('project_created', { project_kind: projectKindOf(project), from_template: false });
                return project;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['userProjects'] });
            queryClient.invalidateQueries({ queryKey: ['allTasks'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    });
}

export function useUpdateProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ projectId, updates }: UpdateProjectPayload) => {
            // Project (root) dates are governed by the bottom-up envelope
            // roll-up, so neither date is a plain column write here:
            //   * start_date moves the whole project via an anchored subtree
            //     shift (reschedule_project_start RPC). A direct column write
            //     would be rejected by enforce_task_date_envelope (children fall
            //     outside the new span) or silently reverted by the roll-up.
            //   * due_date, when supplied, is a TARGET finish date: the caller
            //     only sends it when the user actually changed it, and it reflows
            //     the incomplete tasks proportionally (rescale_project_incomplete)
            //     to land exactly on it. It is never a plain column write.
            const { start_date, due_date, ...rest } = updates;

            const dbUpdates: TaskUpdate = {
                title: rest.title,
                description: rest.description,
                updated_at: nowUtcIso(),
                settings: rest.settings,
                status: rest.status,
                supervisor_email: rest.supervisor_email,
            };
            await planter.entities.Project.update(projectId, dbUpdates);

            // Reschedule shifts the root + every descendant by (new - old) days.
            // No-ops in the RPC when the delta is zero, so it is safe to call on
            // every save where a start date is present. Runs BEFORE any due-date
            // rescale so the reflow anchors on the updated start.
            const newStartIso = toIsoDate(start_date);
            if (newStartIso) {
                const { error } = await planter.rpc('reschedule_project_start', {
                    p_root_id: projectId,
                    p_new_start: newStartIso,
                });
                if (error) throw error;
            }

            // Proportional duration rescale: when the user retargets the project
            // due date, reflow the INCOMPLETE tasks so the last lands exactly on
            // it (completed tasks frozen). The caller passes due_date only when it
            // changed, so this never fires on an unrelated settings save.
            const targetDueIso = toIsoDate(due_date);
            if (targetDueIso) {
                const { error } = await planter.rpc('rescale_project_incomplete', {
                    p_root_id: projectId,
                    p_target_due: targetDueIso,
                });
                if (error) throw error;
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects'], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['userProjects'], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['project', variables.projectId], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['projectHierarchy', variables.projectId], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['allTasks'], refetchType: 'active' });
            queryClient.invalidateQueries({ queryKey: ['tasks'], refetchType: 'active' });
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
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
            queryClient.invalidateQueries({ queryKey: ['allTasks'] });
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
        }
    });
}
