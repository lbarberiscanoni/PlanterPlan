import { PROJECT_STATUS, TASK_STATUS } from '@/shared/constants/domain';
import type { Project, TaskRow } from '@/shared/db/app.types';

export type DerivedProjectState = 'archived' | 'complete' | 'in_progress' | 'not_started' | 'empty';

export interface DerivedProjectStateResult {
    state: DerivedProjectState;
    completedTasks: number;
    totalTasks: number;
}

const startedTaskStatuses = new Set<string>([
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.BLOCKED,
    TASK_STATUS.COMPLETED,
    TASK_STATUS.OVERDUE,
    TASK_STATUS.DUE_SOON,
]);

export const DERIVED_PROJECT_STATE_BADGE_CLASSES: Record<DerivedProjectState, string> = {
    archived: 'bg-slate-100 text-slate-700',
    complete: 'bg-emerald-100 text-emerald-700',
    in_progress: 'bg-brand-100 text-brand-700',
    not_started: 'bg-indigo-100 text-indigo-700',
    empty: 'bg-slate-100 text-slate-600',
};

/**
 * Derives read-only project lifecycle state from child task progress.
 *
 * @param project - Project root task.
 * @param tasks - Descendant tasks for the project.
 * @returns Derived project state and progress counts.
 */
export function deriveProjectState(project: Project, tasks: readonly TaskRow[]): DerivedProjectStateResult {
    const projectTasks = tasks.filter((task) => task.id !== project.id);
    const totalTasks = projectTasks.length;

    if (project.status === PROJECT_STATUS.ARCHIVED) {
        return { state: 'archived', completedTasks: 0, totalTasks };
    }

    const completedTasks = projectTasks.filter(
        (task) => task.is_complete === true || task.status === TASK_STATUS.COMPLETED,
    ).length;

    if (project.is_complete === true || (totalTasks > 0 && completedTasks === totalTasks)) {
        return { state: 'complete', completedTasks, totalTasks };
    }

    if (totalTasks === 0) {
        return { state: 'empty', completedTasks: 0, totalTasks: 0 };
    }

    const hasStartedTask = projectTasks.some((task) => (
        task.is_complete === true || startedTaskStatuses.has(task.status ?? '')
    ));

    return {
        state: hasStartedTask ? 'in_progress' : 'not_started',
        completedTasks,
        totalTasks,
    };
}
