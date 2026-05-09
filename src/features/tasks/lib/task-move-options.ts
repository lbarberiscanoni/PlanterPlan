import type { TaskRow } from '@/shared/db/app.types';
import { canReparentTask, canTaskHaveChildren } from '@/features/tasks/lib/task-hierarchy';

const MOVE_PARENT_TYPES = new Set(['milestone', 'task']);

/**
 * Returns valid non-DnD parent destinations for a task move.
 *
 * Mirrors the drag/drop hierarchy guard: only instance milestones and tasks
 * can receive moved task rows, and every option must pass canReparentTask.
 *
 * @param task - The task being moved.
 * @param tasks - The full list of project tasks for hierarchy validation.
 * @returns An array of valid parent candidates.
 */
export function getTaskMoveParentOptions(task: TaskRow, tasks: TaskRow[]): TaskRow[] {
    if (task.origin !== 'instance' || !task.parent_task_id) return [];

    return tasks.filter((candidate) => {
        if (candidate.origin !== 'instance') return false;
        if (candidate.id === task.id || candidate.id === task.parent_task_id) return false;
        if (task.root_id && candidate.root_id && candidate.root_id !== task.root_id) return false;
        if (!MOVE_PARENT_TYPES.has(candidate.task_type ?? '')) return false;
        if (!canTaskHaveChildren(candidate, tasks)) return false;
        return canReparentTask(task.id, candidate.id, tasks);
    });
}
