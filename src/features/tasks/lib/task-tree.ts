import type { TaskRow } from '@/shared/db/app.types';

/**
 * Low-level task-tree helpers shared by the grouping (`priority-tasks`) and
 * numbering (`task-numbering`) modules. Kept here to avoid a circular import
 * between those two.
 */

export const compareNullablePosition = (
  a: number | null | undefined,
  b: number | null | undefined,
): number => {
  const left = a ?? Number.MAX_SAFE_INTEGER;
  const right = b ?? Number.MAX_SAFE_INTEGER;
  return left - right;
};

/**
 * Nearest ancestor that is a grouping container: a `milestone` (preferred —
 * always closer) or, when there is no milestone above the task, the `phase`.
 * Lets the grouped view fall back to the phase for work-items placed directly
 * under a phase (depth-2), instead of dumping them in a "No milestone" bucket.
 */
export const findNearestContainer = (
  task: TaskRow,
  taskById: Map<string, TaskRow>,
): TaskRow | null => {
  let parentId = task.parent_task_id;
  const seen = new Set<string>();

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) return null;
    const type = parent.task_type?.toLowerCase();
    if (type === 'milestone' || type === 'phase') return parent;
    parentId = parent.parent_task_id;
  }

  return null;
};
