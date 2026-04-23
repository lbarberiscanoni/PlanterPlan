import type { Database } from './database.types';

export type Json = Database['public']['Tables']['tasks']['Row']['settings'];

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------
export type Nullable<T> = T | null;

// ----------------------------------------------------------------------------
// Tasks
// ----------------------------------------------------------------------------
export type TaskRow = Database['public']['Tables']['tasks']['Row'];
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

/** Standardized Task type for UI components with legacy field support */
export type Task = TaskRow & {
    name?: string;
    launch_date?: string | null;
    project_id?: string | null;
};

/** Standardized Project type */
export type Project = Task & {
    settings?: Record<string, unknown> | null;
};

export type HierarchyTask = TaskRow & {
    children?: HierarchyTask[];
    membership_role?: string;
    isExpanded?: boolean;
};

export type SelectableProject = TaskRow;

export type SidebarTask = TaskRow & {
    is_active?: boolean;
};

// ----------------------------------------------------------------------------
// People
// ----------------------------------------------------------------------------
export type PersonRow = Database['public']['Tables']['people']['Row'];
export type PersonInsert = Database['public']['Tables']['people']['Insert'];
export type PersonUpdate = Database['public']['Tables']['people']['Update'];

// ----------------------------------------------------------------------------
// Resources & Relationships
// ----------------------------------------------------------------------------
export type TaskResourceRow = Database['public']['Tables']['task_resources']['Row'];
export type TaskRelationshipRow = Database['public']['Tables']['task_relationships']['Row'];
export type TeamMemberRow = Database['public']['Tables']['project_members']['Row'];

/** Task resource row augmented with its parent task info (used by Resource Library). */
export type ResourceWithTask = TaskResourceRow & {
    task: { id: string; title: string | null; root_id: string | null } | null;
};

// ----------------------------------------------------------------------------
// Comments (Wave 26)
// ----------------------------------------------------------------------------
export type TaskCommentRow    = Database['public']['Tables']['task_comments']['Row'];
export type TaskCommentInsert = Database['public']['Tables']['task_comments']['Insert'];
export type TaskCommentUpdate = Database['public']['Tables']['task_comments']['Update'];

/** Task comment row joined with author profile for UI rendering. */
export type TaskCommentWithAuthor = TaskCommentRow & {
    author: {
        id: string;
        email: string;
        user_metadata?: UserMetadata;
    } | null;
};

// ----------------------------------------------------------------------------
// Notifications (Wave 30)
// ----------------------------------------------------------------------------
export type NotificationPreferencesRow    = Database['public']['Tables']['notification_preferences']['Row'];
export type NotificationPreferencesUpdate = Database['public']['Tables']['notification_preferences']['Update'];
export type NotificationLogRow            = Database['public']['Tables']['notification_log']['Row'];
export type PushSubscriptionRow           = Database['public']['Tables']['push_subscriptions']['Row'];
export type PushSubscriptionInsert        = Database['public']['Tables']['push_subscriptions']['Insert'];

// ----------------------------------------------------------------------------
// Activity Log (Wave 27)
// ----------------------------------------------------------------------------
export type ActivityLogRow = Database['public']['Tables']['activity_log']['Row'];

/** Activity log row joined with the actor's auth profile for UI rendering. */
export type ActivityLogWithActor = ActivityLogRow & {
    actor: {
        id: string;
        email: string;
        user_metadata?: UserMetadata;
    } | null;
};

/** Standardized Person type for UI components */
export interface Person extends PersonRow {
    notes: string | null;
}

// ----------------------------------------------------------------------------
// Form Payloads (mirror Zod schemas in NewProjectForm / TaskForm)
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Auth & Users
// ----------------------------------------------------------------------------
export type UserRole = 'admin' | 'owner' | 'viewer';

export interface UserMetadata {
    saved_email_addresses?: string[];
    [key: string]: unknown;
}

export interface User {
    id: string;
    email: string;
    role: UserRole;
    app_metadata?: UserMetadata;
    user_metadata?: UserMetadata;
    aud?: string;
    created_at?: string;
}

/** Shape emitted by the NewProjectForm Zod schema. */
export interface CreateProjectFormData {
    title: string;
    description?: string;
    purpose?: string;
    actions?: string;
    notes?: string;
    start_date: string;
    templateId?: string | null;
}

/** Shape emitted by the TaskForm Zod schema. */
export interface TaskFormData {
    title: string;
    description?: string | null;
    notes?: string | null;
    purpose?: string | null;
    actions?: string | null;
    days_from_start?: number;
    start_date?: string | null;
    due_date?: string | null;
    templateId?: string | null;
    /** Template-only: recurrence picker UI state. Normalised to `settings.recurrence` before persist. */
    recurrence_kind?: 'none' | 'weekly' | 'monthly';
    recurrence_weekday?: number;
    recurrence_day_of_month?: number;
    recurrence_target_project_id?: string | null;
    /** Wave 22: flag the task as a coaching task so project Coaches may edit it. */
    is_coaching_task?: boolean;
    /** Wave 24: flag the task as a strategy template so completing it opens the Master Library follow-up dialog. */
    is_strategy_template?: boolean;
    /** Wave 29: user ids designated as Phase Leads on a phase/milestone row (owner-only picker in TaskFormFields). */
    phase_lead_user_ids?: string[];
}

/**
 * Documented shape of the loose JSONB stored on `tasks.settings`. Every key
 * is optional; the object is persisted as JSON so shape drift is tolerated.
 * Cast from `task.settings` when reading — do not assume this is the
 * runtime type. Keep in sync with `supabase/functions/nightly-sync` and the
 * recurrence / dedupe / coaching / strategy-template flows.
 */
export interface TaskSettings {
    published?: boolean;
    recurrence?: RecurrenceRule | null;
    /** Wave 22: template id from which this task was cloned; used to hide already-cloned templates in Master Library search. */
    spawnedFromTemplate?: string;
    /** Wave 21: idempotency marker stamped by nightly-sync's recurrence pass. */
    spawnedOn?: string;
    due_soon_threshold?: number;
    /** Wave 22: when true, users with the `coach` project role may update this task (RLS policy "Enable update for coaches on coaching tasks"). */
    is_coaching_task?: boolean;
    /** Wave 24: when true, completing this instance task opens a dialog offering Master Library follow-ups (cloned as siblings). */
    is_strategy_template?: boolean;
    /** Wave 29: on root tasks only — selects the project type ('date' = date-driven scheduling, default; 'checkpoint' = sequential phase-unlock). */
    project_kind?: 'date' | 'checkpoint';
    /** Wave 29: on phase/milestone rows — user ids designated as Phase Leads; consumed by the `user_is_phase_lead` RLS helper. */
    phase_lead_user_ids?: string[];
}

// ----------------------------------------------------------------------------
// Recurrence (Wave 21)
// ----------------------------------------------------------------------------

/**
 * Recurrence rule stored on a template task under `settings.recurrence`.
 * When the rule fires (evaluated in UTC by nightly-sync), the edge function
 * clones the template into `targetProjectId`'s subtree as an instance task.
 *
 * `dayOfMonth` is capped at 28 to avoid Feb/leap-year edge cases. No end dates
 * or intervals — deliberately minimal per Wave 21 scope.
 */
export type RecurrenceRule =
    | { kind: 'weekly'; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; targetProjectId: string }
    | { kind: 'monthly'; dayOfMonth: number; targetProjectId: string };

// ----------------------------------------------------------------------------
// Admin (Wave 34)
// ----------------------------------------------------------------------------

/** Row returned by `public.admin_search_users`. */
export interface AdminUserSearchRow {
    id: string;
    email: string;
    display_name: string;
    last_sign_in_at: string | null;
    project_count: number;
}

/** Shape returned by `public.admin_user_detail(uid)`. */
export interface AdminUserDetail {
    profile: {
        id: string;
        email: string;
        display_name: string;
        last_sign_in_at: string | null;
        created_at: string;
        is_admin: boolean;
        /**
         * `auth.users.banned_until` — non-null + in-the-future = currently
         * suspended. Surfaced so the AdminUsers detail-aside can toggle
         * between "Suspend" and "Unsuspend" buttons. UI formats the raw
         * timestamp relative to `now()`: either "Suspended until {date}"
         * or "Suspended indefinitely" (when the ban duration is the
         * sentinel ~100 years).
         */
        banned_until: string | null;
    };
    projects: Array<{ project_id: string; role: string; project_title: string | null }>;
    task_counts: { assigned: number; completed: number; overdue: number };
}

/** Row returned by `public.admin_recent_activity`. */
export interface AdminActivityRow {
    id: string;
    project_id: string | null;
    actor_id: string | null;
    actor_email: string | null;
    entity_type: string;
    entity_id: string | null;
    action: string;
    payload: unknown;
    created_at: string;
}

/**
 * Row returned by `public.admin_list_users` (Wave 34 Task 2). The RPC pushes
 * filters server-side so the UI doesn't carry millions of rows.
 */
export interface AdminListUserRow {
    id: string;
    email: string;
    display_name: string;
    last_sign_in_at: string | null;
    is_admin: boolean;
    active_project_count: number;
    completed_tasks_30d: number;
    overdue_task_count: number;
}

/** Filter shape for `admin_list_users`. */
export interface AdminListUsersFilter {
    role?: 'all' | 'admin' | 'standard';
    lastLogin?: 'all' | 'last_7' | 'last_30' | 'inactive';
    hasOverdue?: boolean;
    search?: string;
}

/** Shape returned by `public.admin_analytics_snapshot()` (Wave 34 Task 3). */
export interface AdminAnalyticsSnapshot {
    totals: {
        users: number;
        projects: number;
        active_projects_30d: number;
        new_users_30d: number;
    };
    new_projects_per_week: Array<{ week_start: string; count: number }>;
    project_kind_breakdown: Array<{ kind: 'date' | 'checkpoint'; count: number }>;
    task_status_breakdown: Array<{ status: string; count: number }>;
    most_active_users: Array<{ user_id: string; email: string; display_name: string; tasks_created_30d: number }>;
    most_popular_templates: Array<{ template_id: string; title: string; clone_count: number }>;
}

// ----------------------------------------------------------------------------
// Integrations (Wave 35) — ICS feed tokens
// ----------------------------------------------------------------------------

/** Row in `public.ics_feed_tokens`. */
export interface IcsFeedTokenRow {
    id: string;
    user_id: string;
    token: string;
    label: string | null;
    project_filter: string[] | null;
    created_at: string;
    revoked_at: string | null;
    last_accessed_at: string | null;
}

/** Payload for creating a new ICS token. The client generates the token value via crypto.randomUUID(). */
export interface CreateIcsFeedTokenInput {
    label?: string | null;
    project_filter?: string[] | null;
}
