import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TaskInsert, TaskUpdate, TaskRow } from '@/shared/db/app.types'
import { planter as planterClient } from '@/shared/api/planterClient'

// We use TaskInsert/TaskUpdate but sometimes hooks pass custom subsets
interface TaskMutationPayload extends Partial<TaskUpdate> {
 id: string;
 root_id?: string;
}

export function useCreateTask() {
 const queryClient = useQueryClient()
 return useMutation<TaskRow, Error, TaskInsert | TaskInsert[]>({
 mutationFn: (data) => planterClient.entities.Task.create(data),
 onSettled: async (data, _error, variables) => {
 const firstVar = Array.isArray(variables) ? variables[0] : variables;
 const inputRootId = typeof firstVar === 'object' && firstVar && 'root_id' in firstVar ? firstVar.root_id : undefined;
 // Fall back to the returned row's root_id (root-task creation sets
 // root_id = id via the DB trigger, so the input is usually null there).
 const rootId = inputRootId ?? data?.root_id ?? data?.id;
 if (rootId) {
 queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] })
 } else if (import.meta.env.DEV) {
 // Dropped the ['tasks', 'root'] fallback — no consumer reads it.
 // A task with no resolvable root_id shouldn't happen under the
 // current data model; warn loudly in dev so we notice.
 console.warn('[useCreateTask] cannot resolve rootId for invalidation; cache may be stale', { variables, data });
 }

 // §3.3 Date Engine: bubble-up dates to parent after task creation
 const parentId = data?.parent_task_id;
 if (parentId) {
 await planterClient.entities.Task.updateParentDates(parentId);
 if (rootId) queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] });
 }
 }
 })
}

type UpdateTaskContext = {
 previousTasks?: TaskRow[];
 previousTaskInfo?: TaskRow;
 rootId?: string | null;
 updatedTaskId: string;
};

export function useUpdateTask() {
 const queryClient = useQueryClient()
 return useMutation<TaskRow, Error, TaskMutationPayload, UpdateTaskContext>({
 mutationFn: async (data) => {
 // §3.3 Milestone Automation: route pure status changes through updateStatus
 // so that cascade-down and bubble-up logic fires correctly.
 const nonStatusNonMeta = Object.keys(data).filter(k => k !== 'id' && k !== 'root_id' && k !== 'status');
 if (data.status != null && nonStatusNonMeta.length === 0) {
 const result = await planterClient.entities.Task.updateStatus(data.id, data.status);
 if (result.error) throw result.error;
 if (!result.data) throw new Error('Status update returned no data');
 return result.data as TaskRow;
 }
 return planterClient.entities.Task.update(data.id, data);
 },
 onMutate: async (updatedTask) => {
 const rootId = updatedTask.root_id;
 // Skip the optimistic-update path entirely when `rootId` is missing:
 // the previous fallback `['tasks', 'root']` cache key has no
 // consumer in the app, so writing to it is dead work. If a caller
 // ever hits this path under a real rootId-less mutation, React Query
 // will still refetch `['task', id]` on settle and the UI reflects
 // the server state — just without the snapshot-rollback affordance.
 if (!rootId) {
 if (import.meta.env.DEV) {
 console.warn('[useUpdateTask] mutation missing root_id; skipping optimistic update', { updatedTask });
 }
 await queryClient.cancelQueries({ queryKey: ['task', updatedTask.id] });
 const previousTaskInfo = queryClient.getQueryData<TaskRow>(['task', updatedTask.id]);
 if (previousTaskInfo) {
 queryClient.setQueryData<TaskRow>(['task', updatedTask.id], (old) => (old ? { ...old, ...updatedTask } : undefined));
 }
 return { previousTasks: undefined, previousTaskInfo, rootId: null, updatedTaskId: updatedTask.id };
 }

 const targetKey = ['projectHierarchy', rootId];
 await queryClient.cancelQueries({ queryKey: targetKey });
 await queryClient.cancelQueries({ queryKey: ['task', updatedTask.id] });

 const previousTasks = queryClient.getQueryData<TaskRow[]>(targetKey);
 const previousTaskInfo = queryClient.getQueryData<TaskRow>(['task', updatedTask.id]);

 if (previousTasks) {
 queryClient.setQueryData<TaskRow[]>(targetKey, (old) => {
 if (!Array.isArray(old)) return old;
 return old.map(task =>
 task.id === updatedTask.id
 ? { ...task, ...updatedTask }
 : task
 );
 });
 }
 if (previousTaskInfo) {
 queryClient.setQueryData<TaskRow>(['task', updatedTask.id], (old) => (old ? { ...old, ...updatedTask } : undefined));
 }

 return { previousTasks, previousTaskInfo, rootId, updatedTaskId: updatedTask.id };
 },
 onError: (_err, _newTodo, context) => {
 if (!context) return;
 const ctx = context;
 // Only roll back the tree cache if we actually snapshotted it.
 if (ctx.rootId && ctx.previousTasks) {
 queryClient.setQueryData(['projectHierarchy', ctx.rootId], ctx.previousTasks);
 }
 if (ctx.previousTaskInfo) {
 queryClient.setQueryData(['task', ctx.updatedTaskId], ctx.previousTaskInfo);
 }
 },
 onSettled: async (data, _error, variables) => {
 const rootId = variables.root_id;
 if (rootId) {
 queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] })
 }
 queryClient.invalidateQueries({ queryKey: ['task', variables.id] })

 // §3.3 Date Engine: bubble-up dates to parent when dates change
 const dateChanged = 'start_date' in variables || 'due_date' in variables;
 const parentId = data?.parent_task_id;
 if (dateChanged && parentId) {
 await planterClient.entities.Task.updateParentDates(parentId);
 if (rootId) queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] });
 }
 }
 })
}

type DeleteTaskContext = { previousTasks?: TaskRow[]; rootId?: string | null; parentId?: string | null; };

export function useDeleteTask() {
 const queryClient = useQueryClient()
 return useMutation<boolean, Error, { id: string, root_id?: string | null }, DeleteTaskContext>({
 mutationFn: (data) => planterClient.entities.Task.delete(data.id),
 onMutate: async (variables) => {
 const { id, root_id: rootId } = variables;

 // Same dead-key cleanup as useUpdateTask: when rootId is missing,
 // skip the optimistic remove — no consumer reads the fallback
 // `['tasks', 'root']` cache key, so the filter was writing to
 // nothing.
 if (!rootId) {
 if (import.meta.env.DEV) {
 console.warn('[useDeleteTask] mutation missing root_id; skipping optimistic remove', { id });
 }
 return { previousTasks: undefined, rootId: null, parentId: null };
 }

 const targetKey = ['projectHierarchy', rootId];
 await queryClient.cancelQueries({ queryKey: targetKey });

 const previousTasks = queryClient.getQueryData<TaskRow[]>(targetKey);

 // §3.3 Date Engine: capture parent_task_id before removing task from cache
 const deletedTask = previousTasks?.find(t => t.id === id);
 const parentId = deletedTask?.parent_task_id ?? null;

 if (previousTasks) {
 queryClient.setQueryData<TaskRow[]>(targetKey, (old) => {
 if (!Array.isArray(old)) return old;
 return old.filter(task => task.id !== id);
 });
 }

 return { previousTasks, rootId, parentId };
 },
 onError: (_err, _variables, context) => {
 if (!context) return;
 const ctx = context;
 if (ctx.rootId && ctx.previousTasks) {
 queryClient.setQueryData(['projectHierarchy', ctx.rootId], ctx.previousTasks);
 }
 },
 onSettled: async (_, _error, variables, context) => {
 const rootId = variables.root_id;
 if (rootId) {
 queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] })
 }
 queryClient.removeQueries({ queryKey: ['task', variables.id] })

 // §3.3 Date Engine: recalculate parent dates after task deletion
 const parentId = context?.parentId;
 if (parentId) {
 await planterClient.entities.Task.updateParentDates(parentId);
 if (rootId) queryClient.invalidateQueries({ queryKey: ['projectHierarchy', rootId] });
 }
 }
 })
}
