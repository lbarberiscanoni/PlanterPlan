import { ROLES } from '@/shared/constants';
import type { TaskRow } from '@/shared/db/app.types';



export type ProjectMembershipRole = string | null | undefined;

/**
 * Any project member (Planter or Team) plus a global Admin holds full task
 * edit authority after the 5->2 role collapse.
 */
export function hasFullTaskEditRole(role: ProjectMembershipRole): boolean {
    return role === ROLES.PLANTER || role === ROLES.TEAM || role === ROLES.ADMIN;
}

export function canUpdateTaskProgress(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

export function canEditTaskContent(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

export function canCreateChildTask(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

/**
 * Delete authority is role-only. The previous `!task?.cloned_from_task_id`
 * clause hid the delete button on every task in a template-cloned project
 * (all such rows carry `cloned_from_task_id`), which is the bulk of real
 * projects. Deletion is now gated authoritatively by the `delete_task` RPC
 * (SECURITY DEFINER, postgres-owned) which cascades through scaffold rows
 * safely, so the client no longer needs to special-case scaffold provenance.
 * The `_task` param is retained for call-site compatibility.
 */
export function canDeleteTask(role: ProjectMembershipRole, task?: Partial<TaskRow> | null): boolean {
    void task; // retained for call-site compatibility; deletion is RPC-gated, not provenance-gated.
    return hasFullTaskEditRole(role);
}

export function canReorderTask(role: ProjectMembershipRole): boolean {
    return hasFullTaskEditRole(role);
}

/**
 * Template (origin='template') edits are restricted to global Admins. Planters
 * and Team members may instantiate templates into new projects but cannot
 * modify the master library.
 */
export function canEditTemplates(role: ProjectMembershipRole): boolean {
    return role === ROLES.ADMIN;
}
