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
 * Delete authority is Admin-only. Planters and Team members use the "N/A"
 * status to retire a task they no longer need rather than destroying the row
 * (and, for roots, the whole project subtree). This matches the authoritative
 * gate in the `delete_task` RPC (SECURITY DEFINER, postgres-owned), which also
 * rejects non-admins. The `_task` param is retained for call-site
 * compatibility; deletion is role-gated, not provenance-gated.
 */
export function canDeleteTask(role: ProjectMembershipRole, task?: Partial<TaskRow> | null): boolean {
    void task; // retained for call-site compatibility; deletion is role-gated, not provenance-gated.
    return role === ROLES.ADMIN;
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
