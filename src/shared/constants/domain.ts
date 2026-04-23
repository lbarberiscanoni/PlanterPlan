export const ROLES = {
 OWNER: 'owner',
 EDITOR: 'editor',
 COACH: 'coach',
 VIEWER: 'viewer',
 LIMITED: 'limited',
 ADMIN: 'admin',
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
 OVERDUE: 'overdue',
 DUE_SOON: 'due_soon',
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

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
