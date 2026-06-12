import type { TaskRow } from '@/shared/db/app.types';
import {
  addDaysToDate,
  compareDateAsc,
  getNow,
  toIsoDate,
} from '@/shared/lib/date-engine';
import { compareNullablePosition, findNearestContainer } from '@/features/tasks/lib/task-tree';
import { computeProjectTaskNumbers } from '@/features/tasks/lib/task-numbering';

export const PRIORITY_DUE_SOON_DAYS = 7;

export const PRIORITY_EXCLUDED_STATUSES = [
  'completed',
  'na',
  'archived',
  'deleted',
  'cancelled',
  'canceled',
] as const;

const EXCLUDED_STATUS_SET = new Set<string>(PRIORITY_EXCLUDED_STATUSES);
const NON_TASK_TYPES = new Set(['project', 'phase', 'milestone']);

export interface PriorityTaskMatch {
  overdue: boolean;
  dueSoon: boolean;
  current: boolean;
}

export interface PriorityTaskEntry {
  task: TaskRow;
  displayNumber: string;
}

export interface PriorityTaskGroup {
  id: string;
  title: string;
  projectTitle: string | null;
  milestone: TaskRow | null;
  tasks: PriorityTaskEntry[];
}

export interface TaskMilestoneContext {
  milestone: TaskRow | null;
  projectTitle: string | null;
}

export interface BuildPriorityTaskGroupsArgs {
  tasks: TaskRow[];
  now?: Date;
  candidateTasks?: TaskRow[];
}

const utcIsoDate = (date: Date): string => toIsoDate(date) ?? '';

const compareTitle = (a: string | null | undefined, b: string | null | undefined): number =>
  (a ?? '').localeCompare(b ?? '');

export const isPriorityExcluded = (task: Pick<TaskRow, 'is_complete' | 'status'>): boolean => {
  if (task.is_complete) return true;
  const status = task.status?.toLowerCase();
  return status ? EXCLUDED_STATUS_SET.has(status) : false;
};

export const getPriorityTaskMatch = (
  task: Pick<TaskRow, 'due_date' | 'is_complete' | 'start_date' | 'status'>,
  now: Date = getNow(),
): PriorityTaskMatch => {
  if (isPriorityExcluded(task)) {
    return { overdue: false, dueSoon: false, current: false };
  }

  const todayIso = utcIsoDate(now);
  const cutoff = addDaysToDate(now, PRIORITY_DUE_SOON_DAYS);
  const soonCutoffIso = cutoff ? utcIsoDate(cutoff) : todayIso;
  const dueIso = toIsoDate(task.due_date);
  const startIso = toIsoDate(task.start_date);

  const overdue = dueIso !== null && dueIso < todayIso;
  const dueSoon = dueIso !== null && dueIso >= todayIso && dueIso <= soonCutoffIso;
  const current = startIso !== null && startIso <= todayIso;

  return { overdue, dueSoon, current };
};

export const isPriorityQualifyingTask = (
  task: Pick<TaskRow, 'due_date' | 'is_complete' | 'start_date' | 'status'>,
  now: Date = getNow(),
): boolean => {
  const match = getPriorityTaskMatch(task, now);
  return match.overdue || match.dueSoon || match.current;
};

export const isPriorityTaskCandidate = (task: TaskRow): boolean => {
  if (task.origin !== 'instance') return false;
  if (task.parent_task_id === null) return false;
  const taskType = task.task_type?.toLowerCase();
  return !taskType || !NON_TASK_TYPES.has(taskType);
};

const findNearestMilestone = (task: TaskRow, taskById: Map<string, TaskRow>): TaskRow | null => {
  let parentId = task.parent_task_id;
  const seen = new Set<string>();

  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = taskById.get(parentId);
    if (!parent) return null;
    if (parent.task_type?.toLowerCase() === 'milestone') return parent;
    parentId = parent.parent_task_id;
  }

  return null;
};

const getProject = (task: TaskRow, taskById: Map<string, TaskRow>): TaskRow | null => {
  if (task.root_id) return taskById.get(task.root_id) ?? null;
  return null;
};

export const getTaskMilestoneContext = (task: TaskRow, tasks: TaskRow[]): TaskMilestoneContext => {
  const taskById = new Map(tasks.map((row) => [row.id, row]));
  const milestone = findNearestMilestone(task, taskById);
  const project = getProject(task, taskById);
  return {
    milestone,
    projectTitle: project?.title ?? null,
  };
};

/**
 * Core grouping: bucket a set of already-selected tasks by their nearest
 * grouping container — a milestone, or the phase when no milestone sits above
 * the task (project title kept for attribution). Sorts groups + tasks and
 * stamps `groupIndex.taskIndex` display numbers. Shared by the priority view
 * and the general "group by milestone" layout. `container` holds the milestone
 * or phase row (the `milestone` field name is retained for compatibility).
 */
const groupCandidatesByMilestone = (
  candidates: TaskRow[],
  taskById: Map<string, TaskRow>,
  numberByTaskId: Map<string, string>,
): PriorityTaskGroup[] => {
  const groups = new Map<string, Omit<PriorityTaskGroup, 'tasks'> & { tasks: TaskRow[] }>();

  for (const task of candidates) {
    const container = findNearestContainer(task, taskById);
    const project = getProject(task, taskById);
    const containerType = container?.task_type?.toLowerCase();
    const groupId = container
      ? `${containerType === 'phase' ? 'phase' : 'milestone'}-${container.id}`
      : `orphan-${task.root_id ?? 'unknown'}`;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        title: container?.title ?? 'Other',
        projectTitle: project?.title ?? null,
        milestone: container,
        tasks: [],
      });
    }

    groups.get(groupId)?.tasks.push(task);
  }

  // Order within a project: real milestones first, then phase fallback groups
  // (loose tasks under a phase), then any true orphans with no container.
  const containerRank = (group: { milestone: TaskRow | null }): number => {
    const type = group.milestone?.task_type?.toLowerCase();
    if (type === 'milestone') return 0;
    if (type === 'phase') return 1;
    return 2;
  };

  return Array.from(groups.values())
    .sort((a, b) => {
      const projectTitleCompare = compareTitle(a.projectTitle, b.projectTitle);
      if (projectTitleCompare !== 0) return projectTitleCompare;

      const rankCompare = containerRank(a) - containerRank(b);
      if (rankCompare !== 0) return rankCompare;

      const positionCompare = compareNullablePosition(a.milestone?.position, b.milestone?.position);
      if (positionCompare !== 0) return positionCompare;

      return compareTitle(a.title, b.title);
    })
    .map((group) => {
      const sortedTasks = [...group.tasks].sort((a, b) => {
        const dateCompare = compareDateAsc(a.due_date, b.due_date);
        if (dateCompare !== 0) return dateCompare;

        const positionCompare = compareNullablePosition(a.position, b.position);
        if (positionCompare !== 0) return positionCompare;

        return compareTitle(a.title, b.title);
      });

      return {
        ...group,
        tasks: sortedTasks.map((task) => ({
          task,
          // Stable, view-independent number from the full-project-tree numbering.
          displayNumber: numberByTaskId.get(task.id) ?? '',
        })),
      };
    });
};

export const buildPriorityTaskGroups = ({
  tasks,
  now = getNow(),
  candidateTasks,
}: BuildPriorityTaskGroupsArgs): PriorityTaskGroup[] => {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const candidates = (candidateTasks ?? tasks).filter(
    (task) => isPriorityTaskCandidate(task) && isPriorityQualifyingTask(task, now),
  );
  return groupCandidatesByMilestone(candidates, taskById, computeProjectTaskNumbers(tasks));
};

export interface BuildMilestoneTaskGroupsArgs {
  tasks: TaskRow[];
  candidateTasks?: TaskRow[];
}

/**
 * Group an arbitrary (already-filtered) task set by nearest container
 * (milestone, falling back to phase) — the default layout for every /tasks
 * filter. Only LEAF rows are shown: a candidate that is the parent of another
 * visible candidate is a structural container (a phase, or a milestone with
 * tasks) and becomes a group header rather than a loose row. This keeps loose
 * depth-2 work-items (no children) visible — grouped under their phase — while
 * removing the "everything in No Milestone" dump of phase/milestone rows.
 */
export const buildMilestoneTaskGroups = ({
  tasks,
  candidateTasks,
}: BuildMilestoneTaskGroupsArgs): PriorityTaskGroup[] => {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const candidates = candidateTasks ?? tasks;
  const parentIds = new Set(
    candidates.map((task) => task.parent_task_id).filter((id): id is string => id !== null),
  );
  // Drop only STRUCTURAL rows (project/phase/milestone) that actually contain
  // other visible rows — those are group headers, not work-items. Tasks/subtasks
  // are always kept (a task with subtasks still shows), and a structural row with
  // no children (e.g. a loose depth-2 work-item the depth-based type calls a
  // "milestone") is kept as a leaf and grouped under its phase.
  const leaves = candidates.filter((task) => {
    const type = task.task_type?.toLowerCase();
    const isStructural = type === 'project' || type === 'phase' || type === 'milestone';
    return !(isStructural && parentIds.has(task.id));
  });
  return groupCandidatesByMilestone(leaves, taskById, computeProjectTaskNumbers(tasks));
};

export const filterPriorityTasks = (tasks: TaskRow[], now: Date = getNow()): TaskRow[] =>
  buildPriorityTaskGroups({ tasks, now }).flatMap((group) => group.tasks.map((entry) => entry.task));
