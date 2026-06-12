import type { TaskRow } from '@/shared/db/app.types';
import { compareNullablePosition, findNearestContainer } from '@/features/tasks/lib/task-tree';

/**
 * Persistent, per-project task numbering.
 *
 * Patrick's church-planting platform numbers work items with a stable
 * `container.leaf` scheme (milestone 17 → tasks 17.1, 17.2; next milestone 18)
 * that stays fixed no matter which view or filter is showing — unlike the old
 * `groupIndex.taskIndex` stamping, which was recomputed per filtered view.
 *
 * The numbers here are derived from the FULL project tree in document order
 * (sibling `position`, then title as a tiebreak), so they're identical across
 * the /tasks grouped view, the flat view, every filter, and the project detail
 * page. They do NOT depend on what subset of tasks is currently visible.
 *
 * Scheme (mirrors the grouped view's `findNearestContainer` model):
 * - A "container" is the nearest milestone above a work item, or the phase when
 *   no milestone sits above it (a loose depth-2 task). Phases are NOT numbered
 *   unless they directly hold loose tasks.
 * - Containers are numbered 1..N in the order their first leaf appears in the
 *   document (scroll-intuitive: numbers increase as you go down).
 * - Leaf work items under a container are numbered C.1..C.k by document order.
 * - The container row itself maps to "C" (so a milestone row shown as a leaf —
 *   e.g. an empty depth-2 milestone — still carries its own number).
 */

const isStructural = (task: TaskRow): boolean => {
  const type = task.task_type?.toLowerCase();
  return type === 'project' || type === 'phase' || type === 'milestone';
};

/**
 * Depth-first document order index for every task, following children sorted by
 * `position` (then title). Lower index = earlier in the tree.
 */
const buildDocOrder = (
  rootId: string,
  tasksByRoot: TaskRow[],
): Map<string, number> => {
  const childrenByParent = new Map<string, TaskRow[]>();
  for (const task of tasksByRoot) {
    if (!task.parent_task_id) continue;
    const list = childrenByParent.get(task.parent_task_id) ?? [];
    list.push(task);
    childrenByParent.set(task.parent_task_id, list);
  }
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => {
      const byPos = compareNullablePosition(a.position, b.position);
      if (byPos !== 0) return byPos;
      return (a.title ?? '').localeCompare(b.title ?? '');
    });
  }

  const order = new Map<string, number>();
  let counter = 0;
  const visited = new Set<string>();
  const walk = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.set(id, counter++);
    for (const child of childrenByParent.get(id) ?? []) {
      walk(child.id);
    }
  };
  walk(rootId);
  return order;
};

/**
 * Compute the stable display number for every task across every project in the
 * given set. Returns a map of task id → display number (e.g. "3" for a
 * container, "3.2" for a leaf). Tasks with no resolvable container are omitted.
 */
export const computeProjectTaskNumbers = (tasks: TaskRow[]): Map<string, string> => {
  const result = new Map<string, string>();
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Bucket tasks by their project root so numbering restarts per project.
  const tasksByRoot = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    const rootId = task.root_id ?? (task.parent_task_id === null ? task.id : null);
    if (!rootId) continue;
    const list = tasksByRoot.get(rootId) ?? [];
    list.push(task);
    tasksByRoot.set(rootId, list);
  }

  for (const [rootId, rootTasks] of tasksByRoot) {
    const docOrder = buildDocOrder(rootId, rootTasks);
    const orderOf = (id: string) => docOrder.get(id) ?? Number.MAX_SAFE_INTEGER;

    // Leaves = work items: any non-root task that isn't a structural row with
    // children (those are containers/group headers, not work items). Matches
    // buildMilestoneTaskGroups' leaf rule, but over the full project tree.
    const parentIds = new Set(
      rootTasks.map((t) => t.parent_task_id).filter((id): id is string => id !== null),
    );
    const leaves = rootTasks.filter(
      (t) => t.parent_task_id !== null && !(isStructural(t) && parentIds.has(t.id)),
    );

    // Group leaves by their nearest container (milestone, else phase).
    const leavesByContainer = new Map<string, { container: TaskRow | null; leaves: TaskRow[] }>();
    for (const leaf of leaves) {
      const container = findNearestContainer(leaf, taskById);
      const key = container ? container.id : `orphan-${rootId}`;
      const entry = leavesByContainer.get(key) ?? { container, leaves: [] };
      entry.leaves.push(leaf);
      leavesByContainer.set(key, entry);
    }

    // Order containers by the document position of their first leaf, then number
    // them and their leaves.
    const ordered = Array.from(leavesByContainer.values()).sort((a, b) => {
      const aFirst = Math.min(...a.leaves.map((l) => orderOf(l.id)));
      const bFirst = Math.min(...b.leaves.map((l) => orderOf(l.id)));
      return aFirst - bFirst;
    });

    ordered.forEach((entry, index) => {
      const containerNumber = index + 1;
      if (entry.container) {
        result.set(entry.container.id, String(containerNumber));
      }
      const sortedLeaves = [...entry.leaves].sort((a, b) => orderOf(a.id) - orderOf(b.id));
      sortedLeaves.forEach((leaf, leafIndex) => {
        result.set(leaf.id, `${containerNumber}.${leafIndex + 1}`);
      });
    });
  }

  return result;
};
