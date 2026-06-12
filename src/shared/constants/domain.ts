export const ROLES = {
 ADMIN: 'admin',
 PLANTER: 'planter',
 TEAM: 'team',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TASK_ORIGIN = {
 INSTANCE: 'instance',
 TEMPLATE: 'template',
} as const;

export type TaskOrigin = (typeof TASK_ORIGIN)[keyof typeof TASK_ORIGIN];

export const TASK_STATUS = {
 TODO: 'todo',
 IN_PROGRESS: 'in_progress',
 BLOCKED: 'blocked',
 COMPLETED: 'completed',
 NOT_APPLICABLE: 'na',
 OVERDUE: 'overdue',
 DUE_SOON: 'due_soon',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/**
 * "Resolved" statuses require no further work: a task is either done
 * (`completed`) or intentionally excluded (`na` — not applicable). Resolved
 * tasks don't block a parent from rolling up to complete and are excluded from
 * outstanding-work counts and active/overdue lists.
 */
export const RESOLVED_TASK_STATUSES: ReadonlySet<string> = new Set([
 TASK_STATUS.COMPLETED,
 TASK_STATUS.NOT_APPLICABLE,
]);

export const isResolvedStatus = (status?: string | null): boolean =>
 status != null && RESOLVED_TASK_STATUSES.has(status);

export const PROJECT_STATUS = {
 PLANNING: 'planning',
 IN_PROGRESS: 'in_progress',
 LAUNCHED: 'launched',
 PAUSED: 'paused',
 ARCHIVED: 'archived',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export const PROJECT_TABS = {
 BOARD: 'board',
 PEOPLE: 'people',
 RESOURCES: 'resources',
 ACTIVITY: 'activity',
} as const;

export const PROJECT_TAB_LABELS = {
 [PROJECT_TABS.BOARD]: 'Tasks & Board',
 [PROJECT_TABS.PEOPLE]: 'Team',
 [PROJECT_TABS.RESOURCES]: 'Resources',
 [PROJECT_TABS.ACTIVITY]: 'Activity',
} as const;
