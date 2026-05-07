import { useMemo } from 'react';
import type { TaskRow } from '@/shared/db/app.types';
import {
 deriveUrgencyForProject,
 compareDateAsc,
 getNow,
 toIsoDate,
 type CheckpointRootLike,
} from '@/shared/lib/date-engine/index';
import { filterPriorityTasks } from '@/features/tasks/lib/priority-tasks';

export type TaskFilterKey =
 | 'my_tasks'
 | 'priority'
 | 'overdue'
 | 'due_soon'
 | 'current'
 | 'not_yet_due'
 | 'completed'
 | 'all_tasks'
 | 'milestones';

export type TaskSortKey = 'chronological' | 'alphabetical';

export interface DueDateRange {
 start: string | null;
 end: string | null;
}

const DEFAULT_DUE_SOON_THRESHOLD = 3;

const isCompleted = (t: TaskRow): boolean =>
 Boolean(t.is_complete) || t.status === 'completed';

/**
 * Build a map of rootId → due_soon_threshold (in days). Root tasks store their
 * per-project threshold on `settings.due_soon_threshold`. Falls back to
 * DEFAULT_DUE_SOON_THRESHOLD for roots without the setting.
 */
const buildThresholdMap = (tasks: TaskRow[]): Map<string, number> => {
 const map = new Map<string, number>();
 for (const t of tasks) {
  if (t.parent_task_id !== null) continue;
  const settings = t.settings;
  let threshold = DEFAULT_DUE_SOON_THRESHOLD;
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
   const raw = (settings as Record<string, unknown>).due_soon_threshold;
   if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    threshold = Math.floor(raw);
   }
  }
  map.set(t.id, threshold);
 }
 return map;
};

const toCheckpointRootLike = (task: TaskRow): CheckpointRootLike => {
 const settings = task.settings && typeof task.settings === 'object' && !Array.isArray(task.settings)
  ? task.settings as Record<string, unknown>
  : null;
 return { parent_task_id: task.parent_task_id, settings };
};

export interface UseTaskFiltersArgs {
 tasks: TaskRow[];
 filter: TaskFilterKey;
 sort: TaskSortKey;
 currentUserId?: string | null;
 now?: Date;
 /** Wave 33: due-date range picker; open-ended when a bound is null. ANDed with the filter predicate. */
 dueDateRange?: DueDateRange;
}

const withinDueDateRange = (
 task: TaskRow,
 range: DueDateRange | undefined,
): boolean => {
 if (!range) return true;
 const { start, end } = range;
 if (start === null && end === null) return true;
 const taskDue = toIsoDate(task.due_date);
 if (!taskDue) return false;
 if (start !== null && taskDue < start) return false;
 if (end !== null && taskDue > end) return false;
 return true;
};

export const filterAndSortTasks = ({
 tasks,
 filter,
 sort,
 currentUserId = null,
 now = getNow(),
 dueDateRange,
}: UseTaskFiltersArgs): TaskRow[] => {
 const thresholds = buildThresholdMap(tasks);
 const rootById = new Map<string, CheckpointRootLike>();
 for (const task of tasks) {
  if (task.parent_task_id === null) {
   rootById.set(task.id, toCheckpointRootLike(task));
  }
 }

 const instanceChildren = tasks.filter(
  (t) => t.parent_task_id !== null && t.origin === 'instance',
 );

 const urgencyOf = (t: TaskRow) => {
  const threshold = t.root_id ? thresholds.get(t.root_id) ?? DEFAULT_DUE_SOON_THRESHOLD : DEFAULT_DUE_SOON_THRESHOLD;
  const rootTask = t.root_id ? rootById.get(t.root_id) ?? null : null;
  return deriveUrgencyForProject(t, rootTask, threshold, now);
 };

 let filtered: TaskRow[];
 switch (filter) {
  case 'my_tasks':
   filtered = currentUserId
    ? instanceChildren.filter((t) =>
     t.assignee_id === currentUserId || (!t.assignee_id && t.creator === currentUserId),
    )
    : [];
   break;
  case 'priority':
   filtered = filterPriorityTasks(tasks, now);
   break;
  case 'overdue':
   filtered = instanceChildren.filter((t) => urgencyOf(t) === 'overdue');
   break;
  case 'due_soon':
   filtered = instanceChildren.filter((t) => urgencyOf(t) === 'due_soon');
   break;
  case 'current':
   filtered = instanceChildren.filter((t) => urgencyOf(t) === 'current');
   break;
  case 'not_yet_due':
   filtered = instanceChildren.filter((t) => urgencyOf(t) === 'not_yet_due');
   break;
  case 'completed':
   filtered = instanceChildren.filter(isCompleted);
   break;
  case 'all_tasks':
   filtered = instanceChildren;
   break;
  case 'milestones':
   filtered = instanceChildren.filter((t) => t.task_type === 'milestone');
   break;
  default:
   filtered = instanceChildren;
 }

 if (dueDateRange && (dueDateRange.start !== null || dueDateRange.end !== null)) {
  filtered = filtered.filter((t) => withinDueDateRange(t, dueDateRange));
 }

 const sorted = [...filtered];
 if (sort === 'alphabetical') {
  sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
 } else {
  // chronological: ascending by due_date, nulls last
  sorted.sort((a, b) => compareDateAsc(a.due_date, b.due_date));
 }
 return sorted;
};

export const useTaskFilters = (args: UseTaskFiltersArgs): TaskRow[] => {
 const { tasks, filter, sort, currentUserId, now, dueDateRange } = args;
 return useMemo(
  () => filterAndSortTasks({ tasks, filter, sort, currentUserId, now, dueDateRange }),
  [tasks, filter, sort, currentUserId, now, dueDateRange],
 );
};

export const FILTER_LABELS: Record<TaskFilterKey, string> = {
 my_tasks: 'My Tasks',
 priority: 'Priority',
 overdue: 'Overdue',
 due_soon: 'Due Soon',
 current: 'Current',
 not_yet_due: 'Not Yet Due',
 completed: 'Completed',
 all_tasks: 'All Tasks',
 milestones: 'Milestones',
};

export const EMPTY_STATE_COPY: Record<TaskFilterKey, string> = {
 my_tasks: 'No tasks found across your projects.',
 priority: 'No overdue, due-soon, or started tasks right now.',
 overdue: 'Nothing is overdue. Nice work.',
 due_soon: 'No tasks are due in the next few days.',
 current: 'No tasks are currently active.',
 not_yet_due: 'No upcoming tasks scheduled.',
 completed: 'No completed tasks yet.',
 all_tasks: 'No tasks in any of your projects.',
 milestones: 'No milestones found.',
};
