import type { TaskRow } from '@/shared/db/app.types';
import {
  addDaysToDate,
  compareDateAsc,
  getNow,
  toIsoDate,
} from '@/shared/lib/date-engine';

export const PRIORITY_DUE_SOON_DAYS = 7;

export const PRIORITY_EXCLUDED_STATUSES = [
  'completed',
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

const compareNullablePosition = (a: number | null | undefined, b: number | null | undefined): number => {
  const left = a ?? Number.MAX_SAFE_INTEGER;
  const right = b ?? Number.MAX_SAFE_INTEGER;
  return left - right;
};

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

export const buildPriorityTaskGroups = ({
  tasks,
  now = getNow(),
  candidateTasks,
}: BuildPriorityTaskGroupsArgs): PriorityTaskGroup[] => {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const candidates = (candidateTasks ?? tasks).filter(
    (task) => isPriorityTaskCandidate(task) && isPriorityQualifyingTask(task, now),
  );
  const groups = new Map<string, Omit<PriorityTaskGroup, 'tasks'> & { tasks: TaskRow[] }>();

  for (const task of candidates) {
    const milestone = findNearestMilestone(task, taskById);
    const project = getProject(task, taskById);
    const groupId = milestone ? `milestone-${milestone.id}` : `orphan-${task.root_id ?? 'unknown'}`;

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        id: groupId,
        title: milestone?.title ?? 'No milestone',
        projectTitle: project?.title ?? null,
        milestone,
        tasks: [],
      });
    }

    groups.get(groupId)?.tasks.push(task);
  }

  return Array.from(groups.values())
    .sort((a, b) => {
      const projectTitleCompare = compareTitle(a.projectTitle, b.projectTitle);
      if (projectTitleCompare !== 0) return projectTitleCompare;

      const orphanCompare = (a.milestone ? 0 : 1) - (b.milestone ? 0 : 1);
      if (orphanCompare !== 0) return orphanCompare;

      const positionCompare = compareNullablePosition(a.milestone?.position, b.milestone?.position);
      if (positionCompare !== 0) return positionCompare;

      return compareTitle(a.title, b.title);
    })
    .map((group, groupIndex) => {
      const sortedTasks = [...group.tasks].sort((a, b) => {
        const dateCompare = compareDateAsc(a.due_date, b.due_date);
        if (dateCompare !== 0) return dateCompare;

        const positionCompare = compareNullablePosition(a.position, b.position);
        if (positionCompare !== 0) return positionCompare;

        return compareTitle(a.title, b.title);
      });

      return {
        ...group,
        tasks: sortedTasks.map((task, taskIndex) => ({
          task,
          displayNumber: `${groupIndex + 1}.${taskIndex + 1}`,
        })),
      };
    });
};

export const filterPriorityTasks = (tasks: TaskRow[], now: Date = getNow()): TaskRow[] =>
  buildPriorityTaskGroups({ tasks, now }).flatMap((group) => group.tasks.map((entry) => entry.task));
