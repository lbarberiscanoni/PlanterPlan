import { ROLES } from '@/shared/constants';
import type { TaskRow } from '@/shared/db/app.types';
import { extractCoachingFlag } from '@/features/tasks/lib/coaching-form';
import { extractPhaseLeads } from '@/shared/lib/phase-lead';

export type ProjectMembershipRole = string | null | undefined;

type TaskPermissionContext = {
    task?: Partial<TaskRow> | null;
    allProjectTasks?: readonly Partial<TaskRow>[];
    userId?: string | null;
};

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
 * Determine whether a viewer/limited user has Phase Lead authority for a task.
 *
 * @param role - The caller's project membership role.
 * @param context - Task ancestry and current-user context for the permission check.
 * @returns True when the user leads an ancestor phase or milestone for the task.
 */
function hasPhaseLeadTaskEditScope(
    role: ProjectMembershipRole,
    context?: TaskPermissionContext,
): boolean {
    if (role !== ROLES.VIEWER && role !== ROLES.LIMITED) return false;
    if (!context?.userId || !context.task?.parent_task_id) return false;

    const tasksById = new Map(
        (context.allProjectTasks ?? [])
            .filter((task): task is Partial<TaskRow> & { id: string } => typeof task.id === 'string')
            .map((task) => [task.id, task]),
    );

    let parentId: string | null | undefined = context.task.parent_task_id;
    const visited = new Set<string>();

    while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = tasksById.get(parentId);
        if (!parent) return false;
        if (extractPhaseLeads(parent).includes(context.userId)) return true;
        parentId = parent.parent_task_id;
    }

    return false;
}

/**
 * Determine whether a role may update a task's progress/status fields.
 *
 * @param role - The caller's project membership role.
 * @param task - The task being updated.
 * @param context - Optional project context for Phase Lead permission evaluation.
 * @returns True when status/progress updates are allowed for this task.
 */
export function canUpdateTaskProgress(
    role: ProjectMembershipRole,
    task?: Partial<TaskRow> | null,
    context?: Omit<TaskPermissionContext, 'task'>,
): boolean {
    if (hasFullTaskEditRole(role)) return true;
    if (hasPhaseLeadTaskEditScope(role, { ...context, task })) return true;
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
export function canEditTaskContent(
    role: ProjectMembershipRole,
    context?: TaskPermissionContext,
): boolean {
    return hasFullTaskEditRole(role) || hasPhaseLeadTaskEditScope(role, context);
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
