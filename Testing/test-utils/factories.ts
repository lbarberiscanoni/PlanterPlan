import { faker } from '@faker-js/faker';
import type {
  TaskRow,
  TeamMemberRow,
  TaskCommentRow,
  TaskCommentWithAuthor,
  NotificationPreferencesRow,
  NotificationLogRow,
  PushSubscriptionRow,
} from '@/shared/db/app.types';

/**
 * Creates a minimal TaskRow stub with sensible defaults.
 * Override any field via the `overrides` parameter.
 */
export function makeTask(overrides: Partial<TaskRow> = {}): TaskRow {
  const id = overrides.id ?? faker.string.uuid();
  return {
    id,
    title: faker.lorem.words(3),
    description: null,
    notes: null,
    purpose: null,
    actions: null,
    status: 'todo',
    origin: 'instance',
    creator: faker.string.uuid(),
    assignee_id: null,
    parent_task_id: null,
    parent_project_id: null,
    root_id: null,
    position: faker.number.int({ min: 1000, max: 100000 }),
    is_complete: false,
    is_locked: false,
    is_premium: false,
    days_from_start: null,
    start_date: null,
    due_date: null,
    location: null,
    priority: null,
    project_type: null,
    prerequisite_phase_id: null,
    primary_resource_id: null,
    settings: null,
    supervisor_email: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Creates a Project stub (a root task with no parent).
 */
export function makeProject(overrides: Partial<TaskRow> = {}): TaskRow {
  const id = overrides.id ?? faker.string.uuid();
  return makeTask({
    id,
    parent_task_id: null,
    root_id: id,
    origin: 'instance',
    start_date: '2026-01-01',
    ...overrides,
  });
}

/**
 * Creates a flat list of tasks that form a parent→child chain.
 * Returns [root, child1, child2, ...] where each child's parent is the previous.
 */
export function makeTaskChain(depth: number, rootId?: string): TaskRow[] {
  const tasks: TaskRow[] = [];
  const rid = rootId ?? faker.string.uuid();
  let parentId: string | null = null;

  for (let i = 0; i < depth; i++) {
    const task = makeTask({
      root_id: rid,
      parent_task_id: parentId,
      position: (i + 1) * 10000,
    });
    if (i === 0) {
      task.id = rid;
      task.root_id = rid;
      task.parent_task_id = null;
    }
    tasks.push(task);
    parentId = task.id;
  }

  return tasks;
}

/**
 * Creates a flat list of sibling tasks under a single parent.
 */
export function makeSiblingTasks(
  count: number,
  parentId: string | null = null,
  rootId: string | null = null,
): TaskRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeTask({
      parent_task_id: parentId,
      root_id: rootId,
      position: (i + 1) * 10000,
    }),
  );
}

/**
 * Creates a TeamMemberRow stub.
 */
export function makeTeamMember(overrides: Partial<TeamMemberRow> = {}): TeamMemberRow {
  return {
    id: faker.string.uuid(),
    project_id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    role: 'editor',
    created_at: new Date().toISOString(),
    ...overrides,
  } as TeamMemberRow;
}

/**
 * Creates a TaskCommentRow stub (Wave 26). `root_id` defaults to `task_id`
 * since the trigger resolves them to the same project root in practice.
 */
export function makeComment(overrides: Partial<TaskCommentRow> = {}): TaskCommentRow {
  const taskId = overrides.task_id ?? faker.string.uuid();
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? faker.string.uuid(),
    task_id: taskId,
    root_id: overrides.root_id ?? taskId,
    parent_comment_id: null,
    author_id: faker.string.uuid(),
    body: faker.lorem.sentence(),
    mentions: [],
    created_at: now,
    updated_at: now,
    edited_at: null,
    deleted_at: null,
    ...overrides,
  };
}

/**
 * Creates a TaskCommentWithAuthor stub. Author defaults to a fake user;
 * override `author` for anonymous / deleted-author edge cases.
 */
export function makeCommentWithAuthor(
  overrides: Partial<TaskCommentWithAuthor> = {},
): TaskCommentWithAuthor {
  const base = makeComment(overrides as Partial<TaskCommentRow>);
  const defaultAuthor = {
    id: base.author_id ?? faker.string.uuid(),
    email: faker.internet.email(),
    user_metadata: { full_name: faker.person.fullName() },
  };
  return {
    ...base,
    author: overrides.author === undefined ? defaultAuthor : overrides.author,
  };
}

/**
 * Creates a PresenceState stub (Wave 27). `joinedAt` defaults to `Date.now()`
 * so tests can override for deterministic ordering. `focusedTaskId` is null.
 */
export interface PresenceState {
  user_id: string;
  email: string;
  joinedAt: number;
  focusedTaskId: string | null;
}

export function makePresenceState(overrides: Partial<PresenceState> = {}): PresenceState {
  return {
    user_id: overrides.user_id ?? faker.string.uuid(),
    email: overrides.email ?? faker.internet.email(),
    joinedAt: overrides.joinedAt ?? Date.now(),
    focusedTaskId: overrides.focusedTaskId ?? null,
  };
}

/** Wave 30: NotificationPreferencesRow stub with documented canonical defaults. */
export function makeNotificationPref(overrides: Partial<NotificationPreferencesRow> = {}): NotificationPreferencesRow {
  return {
    user_id: overrides.user_id ?? faker.string.uuid(),
    email_mentions: overrides.email_mentions ?? true,
    email_overdue_digest: overrides.email_overdue_digest ?? 'daily',
    email_assignment: overrides.email_assignment ?? true,
    push_mentions: overrides.push_mentions ?? true,
    push_overdue: overrides.push_overdue ?? true,
    push_assignment: overrides.push_assignment ?? false,
    quiet_hours_start: overrides.quiet_hours_start ?? null,
    quiet_hours_end: overrides.quiet_hours_end ?? null,
    timezone: overrides.timezone ?? 'UTC',
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

/** Wave 30: NotificationLogRow stub. Defaults to an email mention send. */
export function makeNotificationLogRow(overrides: Partial<NotificationLogRow> = {}): NotificationLogRow {
  return {
    id: overrides.id ?? faker.string.uuid(),
    user_id: overrides.user_id ?? faker.string.uuid(),
    channel: overrides.channel ?? 'email',
    event_type: overrides.event_type ?? 'mention_pending',
    payload: overrides.payload ?? {},
    sent_at: overrides.sent_at ?? new Date().toISOString(),
    provider_id: overrides.provider_id ?? null,
    error: overrides.error ?? null,
  };
}

/** Wave 30: PushSubscriptionRow stub. Endpoint uses a realistic FCM-style URL. */
export function makePushSubscription(overrides: Partial<PushSubscriptionRow> = {}): PushSubscriptionRow {
  const id = overrides.id ?? faker.string.uuid();
  return {
    id,
    user_id: overrides.user_id ?? faker.string.uuid(),
    endpoint: overrides.endpoint ?? `https://fcm.googleapis.com/fcm/send/${id}`,
    p256dh: overrides.p256dh ?? faker.string.alphanumeric(88),
    auth: overrides.auth ?? faker.string.alphanumeric(24),
    user_agent: overrides.user_agent ?? 'vitest',
    created_at: overrides.created_at ?? new Date().toISOString(),
    last_used_at: overrides.last_used_at ?? null,
  };
}
