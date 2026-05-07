import { useMutation, useQueryClient } from '@tanstack/react-query';
import { planter } from '@/shared/api/planterClient';
import { toIsoDate, recalculateProjectDates, nowUtcIso, DateEngineTask } from '@/shared/lib/date-engine';
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
    oldStartDate?: string | null;
}

type ProjectDateShiftUpdate = Partial<TaskUpdate> & {
    id: string;
    start_date?: string | null;
    due_date?: string | null;
    updated_at?: string | null;
};

const getTaskDepth = (
    taskId: string,
    tasksById: Map<string, DateEngineTask>,
    seen = new Set<string>(),
): number => {
    const task = tasksById.get(taskId);
    if (!task?.parent_task_id || seen.has(taskId)) return 0;
    seen.add(taskId);
    return getTaskDepth(task.parent_task_id, tasksById, seen) + 1;
};

const groupDateShiftUpdatesByDepth = (
    updates: ProjectDateShiftUpdate[],
    tasksById: Map<string, DateEngineTask>,
    direction: 'asc' | 'desc',
): ProjectDateShiftUpdate[][] => {
    const groups = new Map<number, ProjectDateShiftUpdate[]>();
    updates.forEach((update) => {
        const depth = getTaskDepth(update.id, tasksById);
        groups.set(depth, [...(groups.get(depth) ?? []), update]);
    });

    return [...groups.entries()]
        .sort(([depthA], [depthB]) => (direction === 'asc' ? depthA - depthB : depthB - depthA))
        .map(([, group]) => group);
};

const maxFinalDirectChildDueDate = (
    projectId: string,
    projectTasks: DateEngineTask[],
    updates: ProjectDateShiftUpdate[],
): string | null | undefined => {
    const directChildren = projectTasks.filter((task) => task.parent_task_id === projectId);
    if (directChildren.length === 0) return undefined;

    const finalDueById = new Map<string, string | null>();
    projectTasks.forEach((task) => {
        finalDueById.set(task.id, toIsoDate(task.due_date));
    });
    updates.forEach((update) => {
        finalDueById.set(update.id, toIsoDate(update.due_date));
    });

    return directChildren
        .reduce<string | null>((maxDue, task) => {
            const dueDate = finalDueById.get(task.id) ?? null;
            if (!dueDate) return maxDue;
            return !maxDue || dueDate > maxDue ? dueDate : maxDue;
        }, null);
};

const toUpsertInsert = (update: ProjectDateShiftUpdate): TaskInsert => update as TaskInsert;

const upsertDateShiftBatch = async (updates: ProjectDateShiftUpdate[]) => {
    if (updates.length === 0) return;
    await planter.entities.Task.upsert(updates.map(toUpsertInsert));
};

const upsertDateShiftGroups = async (
    updates: ProjectDateShiftUpdate[],
    tasksById: Map<string, DateEngineTask>,
    direction: 'asc' | 'desc',
) => {
    const groups = groupDateShiftUpdatesByDepth(updates, tasksById, direction);
    for (const group of groups) {
        await upsertDateShiftBatch(group);
    }
};

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
        mutationFn: async ({ projectId, updates, oldStartDate }: UpdateProjectPayload) => {
            const { start_date: newStartDateStr } = updates;
            const newStartIso = toIsoDate(newStartDateStr);
            const oldStartIso = toIsoDate(oldStartDate);

            const dbUpdates: TaskUpdate = {
                title: updates.title,
                description: updates.description,
                due_date: updates.due_date,
                start_date: updates.start_date,
                updated_at: nowUtcIso(),
                settings: updates.settings,
                status: updates.status,
                supervisor_email: updates.supervisor_email,
            };

            let batchUpdates: ProjectDateShiftUpdate[] = [];
            if (newStartIso && oldStartIso && newStartIso !== oldStartIso) {
                const projectTasks = await planter.entities.Task.filter({ root_id: projectId });
                const tasksById = new Map(
                    (projectTasks as DateEngineTask[] || []).map((task) => [task.id, task]),
                );

                batchUpdates = recalculateProjectDates(
                    projectTasks as DateEngineTask[] || [],
                    newStartIso,
                    oldStartIso,
                ) as ProjectDateShiftUpdate[];

                if (batchUpdates.length > 0) {
                    const finalRootDueDate = maxFinalDirectChildDueDate(projectId, projectTasks as DateEngineTask[], batchUpdates);
                    const rootDuePatch = finalRootDueDate ?? dbUpdates.due_date;
                    const movesLater = newStartIso > oldStartIso;

                    if (movesLater && rootDuePatch) {
                        await planter.entities.Project.update(projectId, {
                            due_date: rootDuePatch,
                            updated_at: nowUtcIso(),
                        });
                    }

                    if (!movesLater) {
                        await planter.entities.Project.update(projectId, {
                            start_date: newStartIso,
                            updated_at: nowUtcIso(),
                        });

                        const startOnlyUpdates = batchUpdates
                            .filter((update) => update.start_date !== undefined)
                            .map((update) => ({
                                id: update.id,
                                start_date: update.start_date,
                                updated_at: update.updated_at,
                            }));
                        await upsertDateShiftGroups(startOnlyUpdates, tasksById, 'asc');
                    } else {
                        const dueOnlyUpdates = batchUpdates
                            .filter((update) => update.due_date)
                            .map((update) => ({
                                id: update.id,
                                due_date: update.due_date,
                                updated_at: update.updated_at,
                            }));
                        await upsertDateShiftGroups(dueOnlyUpdates, tasksById, 'asc');
                    }

                    await upsertDateShiftGroups(batchUpdates, tasksById, 'desc');

                    await planter.entities.Project.update(projectId, {
                        ...dbUpdates,
                        due_date: rootDuePatch,
                    });

                    return { shiftedCount: batchUpdates.length };
                }
            }

            await planter.entities.Project.update(projectId, dbUpdates);

            return { shiftedCount: batchUpdates.length };
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            queryClient.invalidateQueries({ queryKey: ['userProjects'] });
            queryClient.invalidateQueries({ queryKey: ['project', variables.projectId] });
            queryClient.invalidateQueries({ queryKey: ['projectHierarchy', variables.projectId] });
        }
    });
}

export function useDeleteProject() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (projectId: string) => {
            await planter.entities.Project.delete(projectId);
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
