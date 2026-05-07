import { ROLES } from '@/shared/constants';
import type { TaskRow } from '@/shared/db/app.types';
import { extractCoachingFlag } from '@/features/tasks/lib/coaching-form';

export type ProjectMembershipRole = string | null | undefined;

/**
 * Determine whether a project role has unrestricted task edit authority.
 *
 * @param role - The caller's project membership role.
 * @returns True when the role may edit task content and structure.
 */
export function hasFullTaskEditRole(role: ProjectMembershipRole): boolean {
    return role === ROLES.OWNER || role === ROLES.EDITOR || role === ROLES.ADMIN;
}

/**
 * Determine whether a role may update a task's progress/status fields.
 *
 * @param role - The caller's project membership role.
 * @param task - The task being updated.
 * @returns True when status/progress updates are allowed for this task.
 */
export function canUpdateTaskProgress(role: ProjectMembershipRole, task?: Partial<TaskRow> | null): boolean {
    if (hasFullTaskEditRole(role)) return true;
    return role === ROLES.COACH
        && task?.origin === 'instance'
        && extractCoachingFlag(task);
}

/**
 * Determine whether a role may edit task content fields.
 *
 * @param role - The caller's project membership role.
 * @returns True when task content edits are allowed.
 */
export function canEditTaskContent(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

/**
 * Determine whether a role may create child tasks.
 *
 * @param role - The caller's project membership role.
 * @returns True when child task creation is allowed.
 */
export function canCreateChildTask(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

/**
 * Determine whether a role may delete a task.
 *
 * @param role - The caller's project membership role.
 * @param task - The task being considered for deletion.
 * @returns True when deletion is allowed for the role and task.
 */
export function canDeleteTask(role: ProjectMembershipRole, task?: Partial<TaskRow> | null): boolean {
    if (!hasFullTaskEditRole(role)) return false;
    return !task?.cloned_from_task_id;
}

/**
 * Determine whether a role may reorder tasks.
 *
 * @param role - The caller's project membership role.
 * @returns True when task drag/reorder operations are allowed.
 */
export function canReorderTask(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}
