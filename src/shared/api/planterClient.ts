import { supabase } from '../db/client';
import { toIsoDate, nowUtcIso, calculateMinMaxDates } from '@/shared/lib/date-engine';
import { retry } from '../lib/retry';
import { assertSafeUrl } from '@/shared/lib/safe-url';
import type { Database } from '@/shared/db/database.types';
import type {
    Project,
    Task,
    TaskInsert,
    TaskUpdate,
    TaskResourceRow,
    ResourceWithTask,
    TaskRelationshipRow,
    PersonRow,
    TeamMemberRow,
    UserMetadata,
    TaskCommentRow,
    TaskCommentWithAuthor,
    ActivityLogWithActor,
    NotificationPreferencesRow,
    NotificationPreferencesUpdate,
    NotificationLogRow,
    PushSubscriptionRow,
    PushSubscriptionInsert,
    AdminUserSearchRow,
    AdminUserDetail,
    AdminActivityRow,
    AdminListUserRow,
    AdminListUsersFilter,
    AdminRootTaskSearchRow,
    AdminTemplateCloneRow,
    AdminTemplateRootRow,
    AdminAnalyticsSnapshot,
    IcsFeedTokenRow,
    CreateIcsFeedTokenInput,
} from '@/shared/db/app.types';
import type { User as AuthUser } from '@supabase/supabase-js';


export interface CreateProjectPayload {
    title?: string;
    name?: string;
    description?: string;
    launch_date?: string | Date;
    start_date?: string | Date;
    status?: string;
}

export class PlanterError extends Error {
    // `status` is either a numeric HTTP-ish status (e.g. 401, 500 for
    // client-synthesized errors) OR a string PostgREST / Postgres error
    // code (e.g. "23505" for unique_violation, "PGRST302" for permission
    // denied). Previously we ran parseInt on `error.code` before passing
    // it in — but PostgREST codes are non-numeric strings, so parseInt
    // returned NaN at 36 sites, making this field useless for branching.
    // The current call sites pass `error.code ?? '500'` directly.
    constructor(message: string, public status?: number | string, public metadata?: unknown) {
        super(message);
        this.name = 'PlanterError';
    }
}

export interface PlanterClient {
    auth: {
        me: () => Promise<AuthUser | null>;
        signOut: () => Promise<void>;
        updateProfile: (attributes: UserMetadata) => Promise<AuthUser>;
        changePassword: (newPassword: string) => Promise<void>;
    };
    entities: {
        Project: ProjectEntityClient;
        Task: TaskEntityClient;
        TaskRelationship: EntityClient<TaskRelationshipRow, Database['public']['Tables']['task_relationships']['Insert'], Database['public']['Tables']['task_relationships']['Update']>;
        Phase: EntityClient<Task, TaskInsert, TaskUpdate>;
        Milestone: EntityClient<Task, TaskInsert, TaskUpdate>;
        TaskWithResources: {
            listTemplates: (options?: { from?: number, limit?: number, resourceType?: string | null, userId?: string, viewerId?: string, signal?: AbortSignal }) => Promise<{ data: Task[], error: Error | null }>;
            searchTemplates: (options: { query: string, limit?: number, resourceType?: string | null, userId?: string, viewerId?: string, signal?: AbortSignal }) => Promise<{ data: Task[], error: Error | null }>;
            listAllVisibleTemplates: (viewerId?: string) => Promise<Task[]>;
        };
        TaskResource: TaskResourceEntityClient;
        TeamMember: EntityClient<TeamMemberRow, Database['public']['Tables']['project_members']['Insert'], Database['public']['Tables']['project_members']['Update']>;
        Person: EntityClient<PersonRow, Database['public']['Tables']['people']['Insert'], Database['public']['Tables']['people']['Update']>;
        TaskComment: TaskCommentEntityClient;
        ActivityLog: ActivityLogEntityClient;
        PushSubscription: PushSubscriptionEntityClient;
    };
    rpc: <T = unknown, P extends object = object>(functionName: string, params: P) => Promise<{ data: T | null, error: Error | null }>;
    functions: {
        /**
         * Invoke a Supabase Edge Function by name. Thin wrapper around
         * `supabase.functions.invoke` so components never touch the SDK
         * directly.
         * @param functionName - Edge Function name (e.g. 'supervisor-report').
         * @param opts - Optional invocation options; currently only a JSON body.
         * @returns Promise resolving to `{ data, error }` — `data` is the
         *   parsed function response (or `null`); `error` is a normalized
         *   `Error` (never an upstream body).
         */
        invoke: <T = unknown>(functionName: string, opts?: { body?: Record<string, unknown> }) => Promise<{ data: T | null, error: Error | null }>;
    };
    /** Wave 30 — per-user notification preferences + audit log. */
    notifications: {
        /** Returns the authenticated user's preferences row (RLS auto-filters to own). */
        getPreferences: () => Promise<NotificationPreferencesRow>;
        /** Partial update of the caller's preferences row; returns the updated row. */
        updatePreferences: (patch: NotificationPreferencesUpdate) => Promise<NotificationPreferencesRow>;
        /** Returns recent notification-log rows for the caller (newest first). */
        listLog: (opts?: { limit?: number; before?: string; eventType?: string }) => Promise<NotificationLogRow[]>;
    };
    /** Wave 34 — admin-only cross-tenant RPCs. Each RPC is SECURITY DEFINER + is_admin(auth.uid())-gated. */
    admin: {
        /** Fuzzy search across auth.users by email / full_name. Returns up to `limit` matches (default 20, max 100). Debounce at the caller. */
        searchUsers: (query: string, limit?: number) => Promise<AdminUserSearchRow[]>;
        /** Full user-detail payload: profile, project memberships, task counts. */
        userDetail: (uid: string) => Promise<AdminUserDetail | null>;
        /** Cross-project activity feed (hydrated with actor email). */
        recentActivity: (limit?: number) => Promise<AdminActivityRow[]>;
        /** Paginated user list with server-side filters (Wave 34 Task 2). */
        listUsers: (filter: AdminListUsersFilter, limit?: number, offset?: number) => Promise<AdminListUserRow[]>;
        /** Admin-gated project/template root search. */
        searchRootTasks: (query: string, origin?: 'instance' | 'template' | null, limit?: number) => Promise<AdminRootTaskSearchRow[]>;
        /** Admin-gated template roots catalog. */
        listTemplateRoots: () => Promise<AdminTemplateRootRow[]>;
        /** Admin-gated cloned instance list for one template root. */
        listTemplateClones: (templateId: string) => Promise<AdminTemplateCloneRow[]>;
        /** Aggregated analytics snapshot for the /admin/analytics dashboard (Wave 34 Task 3). */
        analyticsSnapshot: () => Promise<AdminAnalyticsSnapshot | null>;
        /** Grant or revoke platform-admin status for a user. Self-demotion forbidden server-side. */
        setAdminRole: (targetUid: string, makeAdmin: boolean) => Promise<void>;
        /** Suspend a user via `auth.admin.updateUserById({ ban_duration })`. Self-suspension forbidden. */
        suspendUser: (targetUid: string, durationHours?: number) => Promise<void>;
        /** Clear a user's ban. */
        unsuspendUser: (targetUid: string) => Promise<void>;
        /** Generate a password-recovery link the admin can share out-of-band. Returns the URL. */
        generatePasswordResetLink: (targetUid: string) => Promise<string>;
    };
    /** Wave 35 — third-party integrations (starts with ICS calendar feeds). */
    integrations: {
        /** List the current user's ICS tokens (active + revoked). */
        listIcsFeedTokens: () => Promise<IcsFeedTokenRow[]>;
        /** Create a new ICS token. Client generates the random token value via crypto.randomUUID(). */
        createIcsFeedToken: (input: CreateIcsFeedTokenInput) => Promise<IcsFeedTokenRow>;
        /** Soft-revoke a token (sets revoked_at = now). */
        revokeIcsFeedToken: (id: string) => Promise<IcsFeedTokenRow>;
    };
}

interface EntityClient<T, TInsert, TUpdate> {
    list: (options?: { signal?: AbortSignal }) => Promise<T[]>;
    get: (id: string, options?: { signal?: AbortSignal }) => Promise<T | null>;
    create: (payload: TInsert | TInsert[], options?: { signal?: AbortSignal }) => Promise<T>;
    update: (id: string, payload: TUpdate, options?: { signal?: AbortSignal }) => Promise<T>;
    delete: (id: string, options?: { signal?: AbortSignal }) => Promise<boolean>;
    filter: (filters: Partial<Record<keyof T, string | number | boolean | null>>, options?: { signal?: AbortSignal }) => Promise<T[]>;
    listByCreator: (userId: string, options?: { signal?: AbortSignal }) => Promise<T[]>;
    upsert: (payload: TInsert | TInsert[], options?: { onConflict?: string; ignoreDuplicates?: boolean; signal?: AbortSignal }) => Promise<{ data: T | T[] | null; error: Error | null }>;
}

interface TaskResourceEntityClient extends EntityClient<TaskResourceRow, Database['public']['Tables']['task_resources']['Insert'], Database['public']['Tables']['task_resources']['Update']> {
    setPrimary: (taskId: string, resourceId: string | null) => Promise<void>;
    listByProject: (projectId: string, options?: { signal?: AbortSignal }) => Promise<ResourceWithTask[]>;
}

interface ProjectEntityClient extends Omit<EntityClient<Project, TaskInsert, TaskUpdate>, 'create' | 'listByCreator'> {
    create: (projectData: CreateProjectPayload & { creator?: string; _token?: string }) => Promise<Project>;
    listByCreator: (userId: string, page?: number, pageSize?: number, options?: { signal?: AbortSignal }) => Promise<Project[]>;
    listJoined: (userId: string) => Promise<Project[]>;
    getWithStats: (projectId: string) => Promise<{ data: Project & { children: Task[], stats: { totalTasks: number; completedTasks: number; progress: number } }, error: Error | null }>;
    addMember: (projectId: string, userId: string, role: string) => Promise<{ data: TeamMemberRow | undefined, error: Error | null }>;
    addMemberByEmail: (projectId: string, email: string, role: string) => Promise<{ data: TeamMemberRow | undefined, error: Error | null }>;
}

interface TaskEntityClient extends EntityClient<Task, TaskInsert, TaskUpdate> {
    fetchChildren: (taskId: string) => Promise<{ data: Task[] | null, error: Error | null }>;
    updateStatus: (taskId: string, status: string) => Promise<{ data: Task | null, error: Error | null }>;
    updateParentDates: (parentId: string | null) => Promise<void>;
    clone: (templateId: string, newParentId: string | null, newOrigin: string, userId: string, overrides?: Partial<Pick<TaskInsert, 'title' | 'description' | 'start_date' | 'due_date'>>) => Promise<{ data: Task | null, error: Error | null }>;
    addMember?: (taskId: string, userId: string, role: string) => Promise<{ data: TeamMemberRow | undefined, error: Error | null }>;
    listSiblings: (taskId: string) => Promise<Task[]>;
}

interface TaskCommentEntityClient {
    /**
     * Fetches every comment for the task — including soft-deleted rows — so
     * the UI can render tombstones for deleted ancestors and keep reply
     * threads intact. `softDelete` blanks `body`, so pulling deleted rows
     * never leaks content. RLS handles project-membership filtering.
     *
     * @param taskId The target task's id.
     * @returns Chronologically-ordered comments with the author join.
     */
    listByTask: (taskId: string) => Promise<TaskCommentWithAuthor[]>;
    /**
     * Inserts a new comment. `author_id` is also enforced by RLS
     * `WITH CHECK (author_id = auth.uid())`; the caller passes it so
     * client-side optimistic rendering doesn't need a round-trip.
     *
     * @param payload Insert fields. `parent_comment_id` defaults to null
     *   (top-level) and `mentions` defaults to [].
     * @returns The inserted row hydrated with its author.
     */
    create: (payload: {
        task_id: string;
        author_id: string;
        parent_comment_id?: string | null;
        body: string;
        mentions?: string[];
    }) => Promise<TaskCommentWithAuthor>;
    /**
     * Edits `body` + optional `mentions`. Stamps `edited_at = nowUtcIso()`;
     * `updated_at` is set by the `trg_task_comments_handle_updated_at` DB
     * trigger. RLS UPDATE policy restricts to author on undeleted rows.
     *
     * @param commentId The comment row id.
     * @param payload New body and (optional) resolved mentions.
     * @returns The updated row.
     */
    updateBody: (commentId: string, payload: { body: string; mentions?: string[] }) => Promise<TaskCommentRow>;
    /**
     * Soft-deletes a comment: writes `deleted_at = nowUtcIso()` and clears
     * `body` so cached query payloads don't leak content. The row survives
     * so replies keep their lineage; `CommentItem` renders a tombstone.
     *
     * @param commentId The comment row id.
     * @returns The soft-deleted row.
     */
    softDelete: (commentId: string) => Promise<TaskCommentRow>;
}

type ActivityEntityType = 'task' | 'comment' | 'member' | 'project';

interface ActivityLogEntityClient {
    /**
     * Project-scoped activity feed, joined with actor profile. Default limit
     * 50. Pass `before` (created_at ISO string) to paginate backwards.
     * Pass `entityTypes` to filter server-side; omit to return all types.
     *
     * @param projectId The project's root task id.
     * @param opts Pagination + entity-type filter.
     * @returns Activity rows newest-first with the actor join.
     */
    listByProject: (projectId: string, opts?: {
        limit?: number;
        before?: string;
        entityTypes?: ReadonlyArray<ActivityEntityType>;
    }) => Promise<ActivityLogWithActor[]>;

    /**
     * Per-entity feed for the collapsed activity rail in `TaskDetailsView`
     * and future consumers. Default limit 20.
     *
     * @param entityType One of `'task' | 'comment' | 'member' | 'project'`.
     * @param entityId The row id in the target table.
     * @param opts Pagination.
     * @returns Activity rows newest-first with the actor join.
     */
    listByEntity: (
        entityType: ActivityEntityType,
        entityId: string,
        opts?: { limit?: number },
    ) => Promise<ActivityLogWithActor[]>;
}

/** Wave 30 push subscriptions — one row per (user, browser-endpoint). */
interface PushSubscriptionEntityClient {
    /** Inserts a subscription row; RLS enforces `user_id = auth.uid()`. */
    create: (payload: Omit<PushSubscriptionInsert, 'user_id'> & { user_id: string }) => Promise<PushSubscriptionRow>;
    /** Lists the caller's subscriptions newest-first. */
    list: () => Promise<PushSubscriptionRow[]>;
    /** DELETEs the caller's subscription with the given endpoint. RLS-scoped. */
    deleteByEndpoint: (endpoint: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Sub-phase 3.2a — Generic Entity Client (Supabase SDK)
// ---------------------------------------------------------------------------

/**
 * Wraps `supabase.from(name)` with a name-literal constraint. The union
 * includes both public tables AND views (e.g. `tasks_with_primary_resource`)
 * so read-only view access type-checks too. Catches typos like
 * `.from('taks')` at compile time — the previous `(name: string) =>
 * supabase.from(name as any)` bypassed the whole name-literal union.
 *
 * The `createEntityClient` generic crosses boundaries across dozens of
 * (T, TInsert, TUpdate) shapes — Supabase's generated types can't model
 * that variance, so we erase the query back to a permissive shape inside
 * the wrapper once the NAME itself is validated. Individual callers that
 * use `fromTable` directly (outside createEntityClient) still get the
 * full row-typed return.
 */
type PublicTableName =
    | keyof Database['public']['Tables']
    | keyof Database['public']['Views'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = <T extends PublicTableName>(name: T) => supabase.from(name as any);

type WithAbortSignal = { abortSignal(signal: AbortSignal): unknown };
const applySignal = <Q>(query: Q, signal?: AbortSignal): Q => {
    if (signal) (query as unknown as WithAbortSignal).abortSignal(signal);
    return query;
};

const createEntityClient = <T, TInsert, TUpdate>(tableName: PublicTableName, select = '*'): EntityClient<T, TInsert, TUpdate> => ({
    list: async (opts) => {
        return retry(async () => {
            const query = fromTable(tableName).select(select);
            applySignal(query, opts?.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T[]) || [];
        });
    },
    get: async (id: string, opts) => {
        return retry(async () => {
            const query = fromTable(tableName).select(select).eq('id', id).maybeSingle();
            applySignal(query, opts?.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T) || null;
        });
    },
    create: async (payload: TInsert | TInsert[], opts) => {
        return retry(async () => {
            const query = fromTable(tableName).insert(payload as Record<string, unknown>).select(select);
            applySignal(query, opts?.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T[])?.[0] || (data as T);
        });
    },
    update: async (id: string, payload: TUpdate, opts) => {
        return retry(async () => {
            const query = fromTable(tableName).update(payload as Record<string, unknown>).eq('id', id).select(select);
            applySignal(query, opts?.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T[])?.[0] || (data as T);
        });
    },
    delete: async (id: string, opts) => {
        return retry(async () => {
            const query = fromTable(tableName).delete().eq('id', id);
            applySignal(query, opts?.signal);
            const { error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return true;
        });
    },
    filter: async (filters: Partial<Record<keyof T, string | number | boolean | null>>, opts) => {
        return retry(async () => {
            let query = fromTable(tableName).select(select);
            applySignal(query, opts?.signal);

            Object.entries(filters).forEach(([key, val]) => {
                if (val === null) {
                    query = query.is(key, null);
                } else {
                    query = query.eq(key, val as string | number);
                }
            });

            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T[]) || [];
        });
    },
    listByCreator: async (userId: string, opts) => {
        return retry(async () => {
            const query = fromTable(tableName).select(select).eq('creator', userId);
            applySignal(query, opts?.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return (data as T[]) || [];
        });
    },
    upsert: async (payload: TInsert | TInsert[], options: { onConflict?: string; ignoreDuplicates?: boolean; signal?: AbortSignal } = {}) => {
        return retry(async () => {
            const onConflict = options.onConflict || 'id';
            let query = fromTable(tableName).upsert(payload as Record<string, unknown>, {
                onConflict,
                ignoreDuplicates: options.ignoreDuplicates,
            }).select(select);
            if (options.signal) query = query.abortSignal(options.signal);
            const { data, error } = await query;
            if (error) throw new PlanterError(error.message, error.code ?? '500');
            return { data: data as T | T[], error: null };
        });
    }
});

// ---------------------------------------------------------------------------
// Sub-phase 3.2b — Specialized Project & Task methods (Supabase SDK)
// ---------------------------------------------------------------------------

export const planter: PlanterClient = {
    auth: {
        me: async (): Promise<AuthUser | null> => {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error) {
                    console.warn('[PlanterClient] auth.me() failed via SDK:', error);
                    return null;
                }
                return user;
            } catch (error) {
                console.warn('[PlanterClient] auth.me() threw an error:', error);
                return null;
            }
        },
        signOut: async (): Promise<void> => {
            await supabase.auth.signOut();
        },
        updateProfile: async (attributes: UserMetadata): Promise<AuthUser> => {
            return retry(async () => {
                const { data, error } = await supabase.auth.updateUser({
                    data: attributes,
                });
                if (error) throw error;
                return data.user as AuthUser;
            });
        },
        changePassword: async (newPassword: string): Promise<void> => {
            return retry(async () => {
                const { error } = await supabase.auth.updateUser({ password: newPassword });
                if (error) throw error;
            });
        },
    },
    entities: {
        Project: {
            ...createEntityClient<Project, TaskInsert, TaskUpdate>('tasks', '*'),
            list: async (): Promise<Project[]> => {
                return retry(async () => {
                    const { data, error } = await supabase
                        .from('tasks')
                        .select('*')
                        .is('parent_task_id', null)
                        .eq('origin', 'instance')
                        .order('created_at', { ascending: false });

                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as Project[]) || [];
                });
            },
            create: async (projectData: CreateProjectPayload & { creator?: string; _token?: string }): Promise<Project> => {
                return retry(async () => {
                    let userId = projectData.creator;

                    if (!userId) {
                        try {
                            const { data: { user }, error } = await supabase.auth.getUser();
                            if (!error && user) {
                                userId = user.id;
                            } else if (error) {
                                console.warn('[PlanterClient] getUser failed during project creation:', error);
                            }
                        } catch (error) {
                            console.warn('[PlanterClient] getUser threw an exception:', error);
                        }
                    }

                    if (!userId) throw new Error('User must be logged in to create a project');

                    let isoLaunchDate = null;
                    if (projectData.launch_date || projectData.start_date) {
                        isoLaunchDate = toIsoDate(projectData.launch_date || projectData.start_date);
                    }

                    const taskPayload: TaskInsert = {
                        title: projectData.title || projectData.name || 'Untitled Project',
                        description: projectData.description,
                        start_date: isoLaunchDate,
                        due_date: isoLaunchDate,
                        origin: 'instance',
                        parent_task_id: null,
                        root_id: null,
                        status: projectData.status || 'planning',
                        creator: userId,
                        assignee_id: userId,
                    };

                    const { data, error } = await supabase
                        .from('tasks')
                        .insert(taskPayload)
                        .select('*');

                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    const project = Array.isArray(data) ? (data[0] as Project) : (data as unknown as Project);

                    if (!project?.id) {
                        throw new Error('Project creation failed: no ID returned from database.');
                    }

                    try {
                        const { error: rpcError } = await supabase.rpc('initialize_default_project', {
                            p_project_id: project.id,
                            p_creator_id: userId,
                        });
                        if (rpcError) throw rpcError;
                    } catch (rpcCatchError) {
                        console.error('[PlanterClient] RPC Error:', rpcCatchError);
                        try {
                            await supabase.from('tasks').delete().eq('id', project.id);
                        } catch { /* ignore deletion failure */ }
                        throw new Error('Project initialization failed. Please try again.', { cause: rpcCatchError });
                    }

                    return project;
                });
            },
            getWithStats: async (projectId: string): Promise<{ data: Project & { children: Task[], stats: { totalTasks: number; completedTasks: number; progress: number } }, error: Error | null }> => {
                return retry(async () => {
                    const { data: pData, error: pErr } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('id', projectId)
                        .maybeSingle();

                    if (pErr) throw new PlanterError(pErr.message, pErr.code ?? '500');
                    const project = pData as Project;
                    if (!project) throw new Error('Project not found');

                    const { data: cData, error: cErr } = await supabase
                        .from('tasks')
                        .select('id,root_id,is_complete')
                        .eq('root_id', projectId);

                    if (cErr) throw new PlanterError(cErr.message, cErr.code ?? '500');
                    const children = (cData as Task[]) || [];

                    const totalTasks = children.length;
                    const completedTasks = children.filter(t => t.is_complete).length;

                    return {
                        data: {
                            ...project,
                            children,
                            stats: {
                                totalTasks,
                                completedTasks,
                                progress: totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0,
                            }
                        },
                        error: null
                    };
                });
            },
            listByCreator: async (userId: string, page = 1, pageSize = 20, options?: { signal?: AbortSignal }): Promise<Project[]> => {
                return retry(async () => {
                    const from = (page - 1) * pageSize;
                    const to = from + pageSize - 1;

                    let query = supabase
                        .from('tasks')
                        .select('*')
                        .eq('creator', userId)
                        .is('parent_task_id', null)
                        .eq('origin', 'instance')
                        .order('created_at', { ascending: false })
                        .range(from, to);

                    if (options?.signal) query = query.abortSignal(options.signal);
                    const { data, error } = await query;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as Project[]) || [];
                });
            },
            listJoined: async (userId: string): Promise<Project[]> => {
                return retry(async () => {
                    try {
                        const { data, error } = await supabase
                            .from('tasks')
                            .select('*, project_members!inner(*)')
                            .eq('origin', 'instance')
                            .is('parent_task_id', null)
                            .eq('project_members.user_id', userId)
                            .neq('creator', userId);

                        if (error) throw new PlanterError(error.message, error.code ?? '500');
                        return (data as Project[]) || [];
                    } catch {
                        return [];
                    }
                });
            },
            filter: async (filters: Partial<Record<keyof Project, string | number | boolean | null>>): Promise<Project[]> => {
                return retry(async () => {
                    let query = supabase
                        .from('tasks')
                        .select('*')
                        .is('parent_task_id', null)
                        .eq('origin', 'instance');

                    Object.entries(filters).forEach(([key, val]) => {
                        if (val === null) query = query.is(key, null);
                        else query = query.eq(key, val as string | number);
                    });

                    const { data, error } = await query;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as Project[]) || [];
                });
            },
            addMember: async (projectId: string, userId: string, role: string): Promise<{ data: TeamMemberRow | undefined, error: Error | null }> => {
                const { data, error } = await supabase
                    .from('project_members')
                    .insert({ project_id: projectId, user_id: userId, role })
                    .select('*');

                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return { data: (data as TeamMemberRow[])?.[0], error: null };
            },
            addMemberByEmail: async (projectId: string, email: string, role: string): Promise<{ data: TeamMemberRow | undefined, error: Error | null }> => {
                return retry(async () => {
                    // @ts-expect-error RPC name validated at runtime
                    const { data, error } = await supabase.rpc('add_project_member_by_email', {
                        p_project_id: projectId,
                        p_email: email,
                        p_role: role,
                    });
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return { data: data as TeamMemberRow | undefined, error: null };
                });
            },
        },

        // ---------------------------------------------------------------------------
        // Task entity
        // ---------------------------------------------------------------------------

        Task: {
            ...createEntityClient<Task, TaskInsert, TaskUpdate>('tasks'),
            fetchChildren: async (taskId: string): Promise<{ data: Task[] | null, error: Error | null }> => {
                try {
                    const targetTask = await planter.entities.Task.get(taskId);
                    if (!targetTask) throw new PlanterError('Task not found', 404);

                    const projectRootId = targetTask.root_id || targetTask.id;
                    const projectTasks = await planter.entities.Task.filter({ root_id: projectRootId });

                    const childrenByParent = new Map<string, Task[]>();
                    for (const t of projectTasks) {
                        if (!t.parent_task_id) continue;
                        let list = childrenByParent.get(t.parent_task_id);
                        if (!list) {
                            list = [];
                            childrenByParent.set(t.parent_task_id, list);
                        }
                        list.push(t);
                    }

                    const descendants: Task[] = [];
                    const queue = [taskId];
                    const visited = new Set([taskId]);

                    const rootTask = projectTasks.find((t) => t.id === taskId);
                    if (rootTask) descendants.push(rootTask);

                    while (queue.length > 0) {
                        const currentId = queue.shift()!;
                        const children = childrenByParent.get(currentId) || [];

                        for (const child of children) {
                            if (!visited.has(child.id)) {
                                visited.add(child.id);
                                descendants.push(child);
                                queue.push(child.id);
                            }
                        }
                    }

                    return { data: descendants, error: null };
                } catch (error) {
                    console.error('[PlanterClient.fetchChildren] Error:', error);
                    return { data: null, error: error instanceof Error ? error : new PlanterError(String(error)) };
                }
            },
            /**
             * Update a task's status and cascade completion state through the tree.
             *
             * **Server payload invariant (Wave 23):** this method writes only
             * `status`; the `sync_task_completion_flags` BEFORE trigger on
             * `public.tasks` derives `is_complete` from it at the DB layer. See
             * `docs/db/migrations/2026_04_17_sync_task_completion.sql`. React
             * Query callers that hold both fields in the client cache must
             * still patch both locally (`useUpdateTask.onMutate`) — the UI
             * reads both; only the *server* payload is trimmed here.
             *
             * Cascade semantics (unchanged — this method is the app-layer
             * orchestrator for multi-row state that triggers cannot express):
             *   - **Cascade DOWN**: a `completed` status propagates to every
             *     descendant task.
             *   - **Bubble UP**: `reconcileAncestors` walks parents/grandparents,
             *     marking them `completed` when every child is complete, or
             *     reverting to a derived non-completed status otherwise.
             */
            updateStatus: async (taskId: string, status: string): Promise<{ data: Task | null, error: Error | null }> => {
                // Inner helper: derive parent status from child statuses when parent is not fully complete.
                const deriveParentStatus = (children: Task[]): string => {
                    if (children.some(child => child.status === 'blocked')) return 'blocked';
                    if (children.some(child => child.status === 'in_progress')) return 'in_progress';
                    if (children.some(child => child.status === 'overdue')) return 'overdue';
                    return 'todo';
                };

                // Inner helper: walk UP the tree reconciling ancestor completion/status whenever
                // any child status changes (milestone-level automation — §3.3).
                // Wave 23: parent patch writes only `status`; the DB trigger keeps `is_complete` in sync.
                const reconcileAncestors = async (parentId: string, depth: number): Promise<void> => {
                    if (depth > 1) return; // guard: hierarchy is max 1 level of subtasks (§3.3)
                    try {
                        const children = await planter.entities.Task.filter({ parent_task_id: parentId });
                        if (!children.length) return;

                        const allChildrenCompleted = children.every(child => child.status === 'completed');
                        const parentPatch: TaskUpdate = allChildrenCompleted
                            ? { status: 'completed', updated_at: nowUtcIso() }
                            : { status: deriveParentStatus(children), updated_at: nowUtcIso() };

                        const parent = await planter.entities.Task.update(parentId, parentPatch);
                        if (parent?.parent_task_id) {
                            await reconcileAncestors(parent.parent_task_id, depth + 1);
                        }
                    } catch (err) {
                        console.error('[PlanterClient.updateStatus.reconcileAncestors] Error:', err);
                    }
                };

                try {
                    const data = await planter.entities.Task.update(taskId, {
                        status,
                    } as TaskUpdate);

                    if (status === 'completed') {
                        // Cascade DOWN: mark all children as completed
                        const children = await planter.entities.Task.filter({ parent_task_id: taskId });
                        if (children && children.length > 0) {
                            const LIMIT = 3;
                            for (let i = 0; i < children.length; i += LIMIT) {
                                const batch = children.slice(i, i + LIMIT);
                                await Promise.all(
                                    batch.map((child) => (planter.entities.Task as TaskEntityClient).updateStatus(child.id, 'completed'))
                                );
                            }
                        }
                    }

                    // Reconcile UP: update parent milestone/phase whether child moved into or out of completed.
                    if (data?.parent_task_id) {
                        await reconcileAncestors(data.parent_task_id, 0);
                    }
                    return { data, error: null };
                } catch (error: unknown) {
                    console.error('[PlanterClient.updateStatus] Error:', error);
                    return { data: null, error: error instanceof Error ? error : new PlanterError(String(error)) };
                }
            },
            updateParentDates: async (parentId: string | null): Promise<void> => {
                if (!parentId) return;
                try {
                    const children = await planter.entities.Task.filter({ parent_task_id: parentId });
                    const { start_date, due_date } = calculateMinMaxDates(children || []);

                    const parent = await planter.entities.Task.update(parentId, {
                        start_date: start_date ?? null,
                        due_date: due_date ?? null,
                        updated_at: nowUtcIso(),
                    } as TaskUpdate);

                    if (parent && parent.parent_task_id) {
                        await (planter.entities.Task as TaskEntityClient).updateParentDates(parent.parent_task_id);
                    }
                } catch (error) {
                    console.error('[PlanterClient.updateParentDates] Error:', error);
                }
            },
            clone: async (templateId: string, newParentId: string | null, newOrigin: string, userId: string, overrides: Partial<Pick<TaskInsert, 'title' | 'description' | 'start_date' | 'due_date'>> = {}): Promise<{ data: Task | null, error: Error | null }> => {
                try {
                    const rpcParams: Record<string, unknown> = {
                        p_template_id: templateId,
                        p_new_parent_id: newParentId,
                        p_new_origin: newOrigin,
                        p_user_id: userId,
                    };

                    if (overrides.title !== undefined) rpcParams.p_title = overrides.title;
                    if (overrides.description !== undefined) rpcParams.p_description = overrides.description;
                    if (overrides.start_date !== undefined) rpcParams.p_start_date = overrides.start_date;
                    if (overrides.due_date !== undefined) rpcParams.p_due_date = overrides.due_date;

                    const { data, error } = await planter.rpc('clone_project_template', rpcParams);
                    if (error) throw error;

                    // Stamp the cloned root with `settings.spawnedFromTemplate` so the
                    // Master Library combobox can hide templates already present in the
                    // project. The RPC returns `{ new_root_id, root_project_id,
                    // tasks_cloned }` (NOT a full Task), so resolve the cloned row
                    // before returning. Merges onto existing settings (preserving any
                    // keys the RPC or a future migration may add) and is non-fatal —
                    // a stamp failure must never roll back a successful clone.
                    // Mirrors the recurrence-spawn convention in nightly-sync/index.ts.
                    const cloneResult = data as { new_root_id?: string } | null;
                    const newRootId = cloneResult?.new_root_id;
                    if (newRootId) {
                        try {
                            const existing = await planter.entities.Task.get(newRootId);
                            // Only stamp when we could actually read the cloned row — a
                            // null here (transient error / RLS) would otherwise clobber
                            // any settings the RPC populated.
                            if (existing) {
                                const prevSettings = (existing.settings ?? {}) as Record<string, unknown>;
                                // Wave 36 Task 1: stamp the source template's current
                                // template_version onto the instance root so admins can
                                // spot clones stuck on older template iterations. Look
                                // up the source template's version; gracefully skip if
                                // the template row no longer exists.
                                let templateVersionStamp: number | undefined;
                                try {
                                    const sourceTemplate = await planter.entities.Task.get(templateId);
                                    if (sourceTemplate && typeof (sourceTemplate as Task & { template_version?: number }).template_version === 'number') {
                                        templateVersionStamp = (sourceTemplate as Task & { template_version: number }).template_version;
                                    }
                                } catch (srcLookupErr) {
                                    console.warn('[PlanterClient.clone] template_version lookup failed', srcLookupErr);
                                }

                                const mergedSettings: Record<string, unknown> = {
                                    ...prevSettings,
                                    spawnedFromTemplate: templateId,
                                };
                                if (templateVersionStamp !== undefined) {
                                    mergedSettings.cloned_from_template_version = templateVersionStamp;
                                }
                                const updated = await planter.entities.Task.update(newRootId, {
                                    settings: mergedSettings as unknown as TaskUpdate['settings'],
                                });
                                return { data: (updated ?? existing) as Task, error: null };
                            }
                        } catch (stampErr) {
                            console.error('[PlanterClient.clone] stamp failed', stampErr);
                        }
                        // Stamp was skipped or failed — still try to return a hydrated
                        // Task rather than the RPC's result object, which has
                        // `new_root_id` and not `id`.
                        const fallback = await planter.entities.Task.get(newRootId).catch(() => null);
                        if (fallback) return { data: fallback as Task, error: null };
                    }

                    return { data: data as Task, error: null };
                } catch (error) {
                    console.error('[PlanterClient.clone] Error:', error);
                    return { data: null, error: error instanceof Error ? error : new PlanterError(String(error)) };
                }
            },
            listSiblings: async (taskId: string): Promise<Task[]> => {
                return retry(async () => {
                    const target = await planter.entities.Task.get(taskId);
                    if (!target || !target.parent_task_id) return [];

                    const { data, error } = await supabase
                        .from('tasks')
                        .select('*')
                        .eq('parent_task_id', target.parent_task_id)
                        .neq('id', taskId)
                        .order('position', { ascending: true });

                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as Task[]) || [];
                });
            }
        },

        // ---------------------------------------------------------------------------
        // Sub-phase 3.2c — Simple Entity Clients & Utility methods
        // ---------------------------------------------------------------------------

        TaskRelationship: createEntityClient<TaskRelationshipRow, Database['public']['Tables']['task_relationships']['Insert'], Database['public']['Tables']['task_relationships']['Update']>('task_relationships'),
        Phase: createEntityClient<Task, TaskInsert, TaskUpdate>('tasks'),
        Milestone: createEntityClient<Task, TaskInsert, TaskUpdate>('tasks'),
        TaskWithResources: {
            ...createEntityClient<unknown, unknown, unknown>('tasks_with_primary_resource'),
            listTemplates: async ({ from = 0, limit = 25, resourceType = null as string | null, userId, viewerId, signal }: { from?: number, limit?: number, resourceType?: string | null, userId?: string, viewerId?: string, signal?: AbortSignal } = {}): Promise<{ data: Task[], error: Error | null }> => {
                return retry(async () => {
                    const end = from + limit - 1;
                    let query = supabase
                        .from('tasks_with_primary_resource')
                        .select('*')
                        .eq('origin', 'template')
                        .is('parent_task_id', null);

                    if (userId) {
                        // Caller wants a specific user's templates (e.g. "my templates") — no published filter
                        query = query.eq('creator', userId);
                    } else if (viewerId) {
                        // Show published templates OR ones created by the viewer
                        query = query.or(`creator.eq.${viewerId},settings->>published.eq.true`);
                    }
                    if (resourceType && resourceType !== 'all') {
                        query = query.eq('resource_type', resourceType as string);
                    }
                    query = query.order('created_at', { ascending: false }).range(from, end);

                    if (signal) query = query.abortSignal(signal);

                    const { data, error } = await query;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return { data: (data as Task[]) || [], error: null };
                });
            },
            searchTemplates: async ({ query, limit = 20, resourceType = null as string | null, userId, viewerId, signal }: { query: string, limit?: number, resourceType?: string | null, userId?: string, viewerId?: string, signal?: AbortSignal }): Promise<{ data: Task[], error: Error | null }> => {
                return retry(async () => {
                    const normalized = (query || '').trim().slice(0, 100);
                    if (!normalized) return { data: [], error: null };

                    const pattern = `%${normalized}%`;
                    let q = supabase
                        .from('tasks_with_primary_resource')
                        .select('*')
                        .eq('origin', 'template');

                    if (userId) {
                        q = q.eq('creator', userId);
                    } else if (viewerId) {
                        q = q.or(`creator.eq.${viewerId},settings->>published.eq.true`);
                    }
                    q = q.or(`title.ilike.${pattern},description.ilike.${pattern}`);

                    if (resourceType && resourceType !== 'all') {
                        q = q.eq('resource_type', resourceType as string);
                    }
                    q = q.order('title', { ascending: true }).limit(limit);

                    if (signal) q = q.abortSignal(signal);

                    const { data, error } = await q;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return { data: (data as Task[]) || [], error: null };
                });
            },
            listAllVisibleTemplates: async (viewerId?: string): Promise<Task[]> => {
                return retry(async () => {
                    let query = supabase
                        .from('tasks_with_primary_resource')
                        .select('*')
                        .eq('origin', 'template')
                        .is('parent_task_id', null);

                    if (viewerId) {
                        query = query.or(`creator.eq.${viewerId},settings->>published.eq.true`);
                    }
                    query = query.order('created_at', { ascending: false });

                    const { data, error } = await query;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as Task[]) || [];
                });
            }
        },
        TaskResource: (() => {
            const base = createEntityClient<TaskResourceRow, Database['public']['Tables']['task_resources']['Insert'], Database['public']['Tables']['task_resources']['Update']>('task_resources');
            // Server-boundary companion to the render-time `safeUrl` guard:
            // reject `javascript:` / `data:` / `vbscript:` / etc. schemes at the
            // create/update boundary so a stored XSS payload can't reach the
            // database. Authorization itself (who may INSERT / UPDATE which
            // row) is enforced by RLS on `task_resources` — this wrapper is
            // scheme validation only. Accepts http / https / mailto / tel
            // plus relative paths resolved against the shared placeholder
            // base in `safe-url.ts` (mirrors render-time resolution).
            const throwUnsafe = (reason: string) => new PlanterError(reason, 400);
            return {
                ...base,
                /**
                 * Validates `resource_url` scheme then delegates to `base.create`.
                 * Authorization: RLS-scoped (project owner / editor).
                 */
                create: async (payload: Database['public']['Tables']['task_resources']['Insert'] | Database['public']['Tables']['task_resources']['Insert'][], options?: { signal?: AbortSignal }) => {
                    const rows = Array.isArray(payload) ? payload : [payload];
                    for (const row of rows) {
                        assertSafeUrl((row as { resource_url?: unknown }).resource_url, throwUnsafe);
                    }
                    return base.create(payload, options);
                },
                /**
                 * Validates `resource_url` scheme then delegates to `base.update`.
                 * Authorization: RLS-scoped (project owner / editor).
                 */
                update: async (id: string, payload: Database['public']['Tables']['task_resources']['Update'], options?: { signal?: AbortSignal }) => {
                    assertSafeUrl((payload as { resource_url?: unknown }).resource_url, throwUnsafe);
                    return base.update(id, payload, options);
                },
                /**
                 * Validates `resource_url` scheme on every row then delegates to
                 * `base.upsert`. Closes the write path that would otherwise bypass
                 * the scheme allowlist via the inherited `createEntityClient` method.
                 * Authorization: RLS-scoped (project owner / editor).
                 */
                upsert: async (payload: Database['public']['Tables']['task_resources']['Insert'] | Database['public']['Tables']['task_resources']['Insert'][], options?: { onConflict?: string; ignoreDuplicates?: boolean; signal?: AbortSignal }) => {
                    const rows = Array.isArray(payload) ? payload : [payload];
                    for (const row of rows) {
                        assertSafeUrl((row as { resource_url?: unknown }).resource_url, throwUnsafe);
                    }
                    return base.upsert(payload, options);
                },
                setPrimary: async (taskId: string, resourceId: string | null) => {
                    await planter.entities.Task.update(taskId, { primary_resource_id: resourceId } as TaskUpdate);
                },
                listByProject: async (projectId: string, opts?: { signal?: AbortSignal }): Promise<ResourceWithTask[]> => {
                    return retry(async () => {
                        let query = supabase
                            .from('task_resources')
                            .select('*, task:tasks!inner(id, title, root_id)')
                            .eq('tasks.root_id', projectId)
                            .order('created_at', { ascending: false });
                        if (opts?.signal) query = query.abortSignal(opts.signal);
                        const { data, error } = await query;
                        if (error) throw new PlanterError(error.message, error.code ?? '500');
                        return (data as ResourceWithTask[]) || [];
                    });
                },
            };
        })(),
        TeamMember: createEntityClient<TeamMemberRow, Database['public']['Tables']['project_members']['Insert'], Database['public']['Tables']['project_members']['Update']>('project_members'),
        Person: createEntityClient<PersonRow, Database['public']['Tables']['people']['Insert'], Database['public']['Tables']['people']['Update']>('people'),

        // -----------------------------------------------------------------
        // TaskComment (Wave 26)
        // -----------------------------------------------------------------
        TaskComment: {
            // The author join points at auth.users across a schema boundary. PostgREST
            // handles it at runtime but the generated types don't model the cross-schema
            // FK, so the cast to unknown sidesteps the typed-client's SelectQueryError.
            //
            // Returns soft-deleted rows too — the UI renders tombstones so reply chains
            // stay intact when an ancestor is soft-deleted. `softDelete` blanks body, so
            // no content leaks via this query.
            listByTask: async (taskId: string): Promise<TaskCommentWithAuthor[]> => {
                return retry(async () => {
                    const { data, error } = await supabase
                        .from('task_comments')
                        .select('*, author:users(id, email, user_metadata)')
                        .eq('task_id', taskId)
                        .order('created_at', { ascending: true });
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return ((data as unknown) as TaskCommentWithAuthor[]) || [];
                });
            },
            create: async (payload): Promise<TaskCommentWithAuthor> => {
                return retry(async () => {
                    const insert: Database['public']['Tables']['task_comments']['Insert'] = {
                        task_id: payload.task_id,
                        author_id: payload.author_id,
                        parent_comment_id: payload.parent_comment_id ?? null,
                        body: payload.body,
                        mentions: payload.mentions ?? [],
                    };
                    const { data, error } = await supabase
                        .from('task_comments')
                        .insert(insert)
                        .select('*, author:users(id, email, user_metadata)')
                        .single();
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as unknown) as TaskCommentWithAuthor;
                });
            },
            updateBody: async (commentId: string, payload: { body: string; mentions?: string[] }): Promise<TaskCommentRow> => {
                return retry(async () => {
                    const patch: Database['public']['Tables']['task_comments']['Update'] = {
                        body: payload.body,
                        edited_at: nowUtcIso(),
                    };
                    if (payload.mentions !== undefined) patch.mentions = payload.mentions;
                    const { data, error } = await supabase
                        .from('task_comments')
                        .update(patch)
                        .eq('id', commentId)
                        .select('*')
                        .single();
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return data as TaskCommentRow;
                });
            },
            softDelete: async (commentId: string): Promise<TaskCommentRow> => {
                return retry(async () => {
                    const patch: Database['public']['Tables']['task_comments']['Update'] = {
                        deleted_at: nowUtcIso(),
                        body: '',
                    };
                    const { data, error } = await supabase
                        .from('task_comments')
                        .update(patch)
                        .eq('id', commentId)
                        .select('*')
                        .single();
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return data as TaskCommentRow;
                });
            },
        } satisfies TaskCommentEntityClient,

        // -----------------------------------------------------------------
        // ActivityLog (Wave 27)
        // -----------------------------------------------------------------
        // Cross-schema author join via `actor:users(...)` mirrors the Wave 26
        // TaskComment pattern and inherits the same typed-client limitation;
        // the cast to `unknown` sidesteps `SelectQueryError`. See
        // `docs/dev-notes.md` for the Wave 30 RPC replacement plan.
        ActivityLog: {
            listByProject: async (projectId: string, opts?: {
                limit?: number;
                before?: string;
                entityTypes?: ReadonlyArray<ActivityEntityType>;
            }): Promise<ActivityLogWithActor[]> => {
                return retry(async () => {
                    let query = supabase
                        .from('activity_log')
                        .select('*, actor:users(id, email, user_metadata)')
                        .eq('project_id', projectId)
                        .order('created_at', { ascending: false })
                        .limit(opts?.limit ?? 50);
                    if (opts?.before) query = query.lt('created_at', opts.before);
                    if (opts?.entityTypes && opts.entityTypes.length > 0) {
                        // Supabase's typed `.in()` expects its literal enum union.
                        // Route through unknown to keep the runtime call happy.
                        query = (query as unknown as {
                            in: (c: string, v: readonly string[]) => typeof query;
                        }).in('entity_type', opts.entityTypes);
                    }
                    const { data, error } = await query;
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return ((data as unknown) as ActivityLogWithActor[]) || [];
                });
            },
            listByEntity: async (
                entityType: ActivityEntityType,
                entityId: string,
                opts?: { limit?: number },
            ): Promise<ActivityLogWithActor[]> => {
                return retry(async () => {
                    const { data, error } = await supabase
                        .from('activity_log')
                        .select('*, actor:users(id, email, user_metadata)')
                        .eq('entity_type', entityType)
                        .eq('entity_id', entityId)
                        .order('created_at', { ascending: false })
                        .limit(opts?.limit ?? 20);
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return ((data as unknown) as ActivityLogWithActor[]) || [];
                });
            },
        } satisfies ActivityLogEntityClient,

        // -----------------------------------------------------------------
        // PushSubscription (Wave 30)
        // -----------------------------------------------------------------
        PushSubscription: {
            create: async (payload) => {
                return retry(async () => {
                    const { data, error } = await supabase
                        .from('push_subscriptions')
                        .insert(payload)
                        .select('*')
                        .single();
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return data as PushSubscriptionRow;
                });
            },
            list: async () => {
                return retry(async () => {
                    const { data, error } = await supabase
                        .from('push_subscriptions')
                        .select('*')
                        .order('created_at', { ascending: false });
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                    return (data as PushSubscriptionRow[]) || [];
                });
            },
            deleteByEndpoint: async (endpoint) => {
                return retry(async () => {
                    const { error } = await supabase
                        .from('push_subscriptions')
                        .delete()
                        .eq('endpoint', endpoint);
                    if (error) throw new PlanterError(error.message, error.code ?? '500');
                });
            },
        } satisfies PushSubscriptionEntityClient,
    },

    // ---------------------------------------------------------------------------
    // RPC wrapper (Supabase SDK)
    // ---------------------------------------------------------------------------

    rpc: async <T = unknown, P extends object = object>(functionName: string, params: P): Promise<{ data: T | null, error: Error | null }> => {
        return retry(async () => {
            try {
                // @ts-expect-error Supabase rpc typing is tightly coupled to Database generics — params are validated at runtime
                const { data, error } = await supabase.rpc(functionName, params);
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return { data: data as T, error: null };
            } catch (error: unknown) {
                if (error instanceof PlanterError) throw error;
                return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
            }
        });
    },

    // ---------------------------------------------------------------------------
    // Edge Function wrapper (Supabase SDK)
    // ---------------------------------------------------------------------------

    functions: {
        /**
         * Invoke a Supabase Edge Function by name. Normalizes SDK errors into
         * the standard `{ data, error }` shape used across planterClient.
         * @param functionName - Edge Function name (e.g. 'supervisor-report').
         * @param opts - Optional invocation options; currently only a JSON body.
         * @returns Promise resolving to `{ data, error }` — `data` is the
         *   parsed function response (or `null`); `error` is a normalized
         *   `Error` (never an upstream body).
         */
        invoke: async <T = unknown>(
            functionName: string,
            opts?: { body?: Record<string, unknown> },
        ): Promise<{ data: T | null, error: Error | null }> => {
            try {
                const { data, error } = await supabase.functions.invoke<T>(functionName, opts);
                if (error) {
                    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
                }
                return { data: (data ?? null) as T | null, error: null };
            } catch (error: unknown) {
                return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
            }
        },
    },

    // ---------------------------------------------------------------------------
    // Notifications (Wave 30)
    // ---------------------------------------------------------------------------
    // RLS auto-filters SELECTs + UPDATEs to `user_id = auth.uid()`, so these
    // helpers never need to thread the caller id explicitly. See
    // docs/architecture/auth-rbac.md → "Notification Preferences (Wave 30)".

    notifications: {
        getPreferences: async (): Promise<NotificationPreferencesRow> => {
            return retry(async () => {
                const { data, error } = await supabase
                    .from('notification_preferences')
                    .select('*')
                    .limit(1)
                    .maybeSingle();
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                if (!data) {
                    throw new PlanterError('notification_preferences row missing for caller', 404);
                }
                return data as NotificationPreferencesRow;
            });
        },
        updatePreferences: async (patch: NotificationPreferencesUpdate): Promise<NotificationPreferencesRow> => {
            return retry(async () => {
                const { data, error } = await supabase
                    .from('notification_preferences')
                    .update(patch)
                    .select('*')
                    .single();
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return data as NotificationPreferencesRow;
            });
        },
        listLog: async (opts?: { limit?: number; before?: string; eventType?: string }): Promise<NotificationLogRow[]> => {
            return retry(async () => {
                let query = supabase
                    .from('notification_log')
                    .select('*')
                    .order('sent_at', { ascending: false })
                    .limit(opts?.limit ?? 50);
                if (opts?.before) query = query.lt('sent_at', opts.before);
                if (opts?.eventType) query = query.eq('event_type', opts.eventType);
                const { data, error } = await query;
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return (data as NotificationLogRow[]) || [];
            });
        },
    },
    admin: (() => {
        // Shared helper for the three admin-user-moderation actions. Hoists
        // the edge-function call + error normalization so each wrapper below
        // is 2-4 lines.
        //
        // Contract with the edge function:
        //   - HTTP 200 `{ success: true, reset_link? }`  → normal return
        //   - HTTP 200 `{ success: false, error }`        → product error;
        //       surfaced to the UI verbatim (e.g. `self_moderation_forbidden`,
        //       `target_not_found`). Using 200 here on purpose — supabase-js
        //       wraps non-2xx in `FunctionsHttpError` with a generic message,
        //       which loses the specific server string.
        //   - HTTP 401 `{ success: false, error }`        → auth failure; the
        //       edge function returns 401 for a missing / invalid caller JWT.
        //       supabase-js surfaces this via `error`, and we fall back to
        //       its generic message.
        //   - HTTP 500                                    → infra failure
        //       (missing env, unhandled exception); same fallback as 401.
        type ModerationAction = 'suspend' | 'unsuspend' | 'reset_password';
        const invokeModeration = async (
            action: ModerationAction,
            targetUid: string,
            extras?: Record<string, unknown>,
        ): Promise<unknown> => {
            // Spread `extras` BEFORE the authoritative args so a caller can't
            // accidentally override `action` or `target_uid` by passing a
            // conflicting key. Defensive — no current caller does this.
            const { data, error } = await supabase.functions.invoke<{
                success?: boolean;
                error?: string;
                reset_link?: string;
            }>('admin-user-moderation', {
                body: { ...(extras ?? {}), action, target_uid: targetUid },
            });
            // Non-2xx path (401 / 500): the server's error body is inside
            // `error.context` and requires async parsing; fall back to the
            // generic message rather than paying the async cost here.
            if (error) throw new PlanterError(error.message || 'Moderation failed', 500);
            // 200-with-success=false — surface the specific server error.
            if (!data?.success) {
                throw new PlanterError(data?.error || 'Moderation failed', 400);
            }
            return data;
        };

        return {
        /**
         * Wave 34 — fuzzy search across `auth.users` (email / full_name).
         * Gated server-side by `public.is_admin(auth.uid())`; non-admin callers
         * raise `unauthorized`. Debounce at the call site (min 2 chars / 200ms).
         *
         * @param query  Free-text fragment; `%` and `_` are escaped server-side.
         * @param limit  Max rows to return (clamped to 1..100 by the RPC).
         * @returns Up to `limit` `AdminUserSearchRow` rows, newest-signed-in first.
         */
        searchUsers: async (query: string, limit?: number): Promise<AdminUserSearchRow[]> => {
            const { data, error } = await planter.rpc<AdminUserSearchRow[]>('admin_search_users', {
                p_query: query,
                p_max_results: limit ?? 20,
            });
            if (error) throw error;
            return data ?? [];
        },
        /**
         * Wave 34 — single-user drill-down. Profile + project memberships +
         * task counts (assigned / completed-30d / overdue). Gated by
         * `public.is_admin(auth.uid())`.
         *
         * @param uid `auth.users.id` of the user to inspect.
         * @returns `AdminUserDetail` or `null` if the uid doesn't exist.
         */
        userDetail: async (uid: string): Promise<AdminUserDetail | null> => {
            const { data, error } = await planter.rpc<AdminUserDetail | null>('admin_user_detail', {
                p_uid: uid,
            });
            if (error) throw error;
            return data ?? null;
        },
        /**
         * Wave 34 — cross-project activity feed joined with `auth.users` on
         * actor_id for email hydration. Backs the `/admin` home surface.
         * Gated by `public.is_admin(auth.uid())`.
         *
         * @param limit Max rows (clamped to 1..200).
         * @returns Newest `AdminActivityRow[]` first.
         */
        recentActivity: async (limit?: number): Promise<AdminActivityRow[]> => {
            const { data, error } = await planter.rpc<AdminActivityRow[]>('admin_recent_activity', {
                p_limit: limit ?? 50,
            });
            if (error) throw error;
            return data ?? [];
        },
        /**
         * Wave 34 — paginated user list with server-side filtering.
         * Gated by `public.is_admin(auth.uid())`.
         *
         * @param filter `{ role?, lastLogin?, hasOverdue?, search? }`. `search`
         *   is LIKE-escaped server-side; unknown keys are ignored.
         * @param limit  Rows per page (clamped to 1..200; default 50).
         * @param offset Rows to skip (default 0).
         * @returns `AdminListUserRow[]` ordered by last_sign_in_at DESC.
         */
        listUsers: async (
            filter: AdminListUsersFilter,
            limit?: number,
            offset?: number,
        ): Promise<AdminListUserRow[]> => {
            const { data, error } = await planter.rpc<AdminListUserRow[]>('admin_list_users', {
                filter,
                p_limit: limit ?? 50,
                p_offset: offset ?? 0,
            });
            if (error) throw error;
            return data ?? [];
        },
        searchRootTasks: async (
            query: string,
            origin?: 'instance' | 'template' | null,
            limit?: number,
        ): Promise<AdminRootTaskSearchRow[]> => {
            const { data, error } = await planter.rpc<AdminRootTaskSearchRow[]>('admin_search_root_tasks', {
                p_query: query,
                p_origin: origin ?? null,
                p_max_results: limit ?? 10,
            });
            if (error) throw error;
            return data ?? [];
        },
        listTemplateRoots: async (): Promise<AdminTemplateRootRow[]> => {
            const { data, error } = await planter.rpc<AdminTemplateRootRow[]>('admin_template_roots', {});
            if (error) throw error;
            return data ?? [];
        },
        listTemplateClones: async (templateId: string): Promise<AdminTemplateCloneRow[]> => {
            const { data, error } = await planter.rpc<AdminTemplateCloneRow[]>('admin_template_clones', {
                p_template_id: templateId,
            });
            if (error) throw error;
            return data ?? [];
        },
        /**
         * Wave 34 — single-RPC dashboard payload (totals + time series +
         * breakdowns + top-10 lists). Cached at the hook layer with a
         * 5-minute staleTime. Gated by `public.is_admin(auth.uid())`.
         *
         * @returns `AdminAnalyticsSnapshot` with every chart's data, or
         *   `null` if the server returns an empty snapshot.
         */
        analyticsSnapshot: async (): Promise<AdminAnalyticsSnapshot | null> => {
            const { data, error } = await planter.rpc<AdminAnalyticsSnapshot | null>(
                'admin_analytics_snapshot',
                {},
            );
            if (error) throw error;
            return data ?? null;
        },
        /**
         * Toggle a user's platform-admin flag. Gated server-side by
         * `public.is_admin(auth.uid())`. Self-demotion raises
         * `self_demotion_forbidden` (callers should UI-disable the action
         * when `targetUid === currentUser.id`). Writes an activity_log
         * entry on success (surfaces in `admin_recent_activity`).
         *
         * @param targetUid `auth.users.id` of the user to modify.
         * @param makeAdmin `true` = grant admin, `false` = revoke.
         */
        setAdminRole: async (targetUid: string, makeAdmin: boolean): Promise<void> => {
            const { error } = await planter.rpc('admin_set_user_admin_role', {
                p_target_uid: targetUid,
                p_make_admin: makeAdmin,
            });
            if (error) throw error;
        },
        /**
         * Suspend a user via the `admin-user-moderation` edge function.
         * The edge function does the authorize-then-escalate dance with
         * `auth.admin.updateUserById({ ban_duration })`. Omit `durationHours`
         * for effectively-indefinite (100 years); pass a positive number
         * for a time-bounded suspension.
         */
        suspendUser: async (targetUid: string, durationHours?: number): Promise<void> => {
            await invokeModeration('suspend', targetUid, { duration_hours: durationHours });
        },
        unsuspendUser: async (targetUid: string): Promise<void> => {
            await invokeModeration('unsuspend', targetUid);
        },
        /**
         * Generate a Supabase password-recovery link for a user. Returns the
         * URL so the admin can copy + share it out-of-band (Slack, email,
         * etc.) — we don't auto-send. The link expires per the Supabase
         * project's email-OTP TTL (default 24h at the time of writing).
         */
        generatePasswordResetLink: async (targetUid: string): Promise<string> => {
            const body = await invokeModeration('reset_password', targetUid);
            const link = (body as { reset_link?: string })?.reset_link;
            if (typeof link !== 'string' || !link) {
                throw new PlanterError('Reset link missing from moderation response', 500);
            }
            return link;
        },
        };
    })(),
    integrations: {
        /**
         * Wave 35 — list the caller's ICS calendar feed tokens (active +
         * revoked), newest first. RLS auto-filters to `user_id = auth.uid()`.
         *
         * @returns Array of `IcsFeedTokenRow`, possibly empty.
         */
        listIcsFeedTokens: async (): Promise<IcsFeedTokenRow[]> => {
            return retry(async () => {
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError) throw new PlanterError(authError.message, 401);
                if (!user) throw new PlanterError('Not authenticated', 401);
                const { data, error } = await supabase
                    .from('ics_feed_tokens')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return (data as IcsFeedTokenRow[]) ?? [];
            });
        },
        /**
         * Wave 35 — create a new ICS feed token for the caller. Generates
         * 256 bits of randomness via the Web Crypto API (`crypto.getRandomValues`).
         * No non-cryptographic fallback — we throw if secure random is
         * unavailable rather than ship a predictable credential.
         *
         * @param input `{ label?, project_filter? }`. `project_filter` narrows
         *   the feed to tasks whose `root_id IN (...)`; null for all projects.
         * @returns The inserted row, including the plaintext token (the only
         *   time the token is returned to the client; subsequent reads see
         *   it masked by convention — clients should persist/display only once).
         */
        createIcsFeedToken: async (input: CreateIcsFeedTokenInput): Promise<IcsFeedTokenRow> => {
            return retry(async () => {
                const { data: { user }, error: authError } = await supabase.auth.getUser();
                if (authError) throw new PlanterError(authError.message, 401);
                if (!user) throw new PlanterError('Not authenticated', 401);

                // Generate the opaque token client-side using the Web Crypto API —
                // 256 bits (32 bytes → 64 hex chars). The token IS the credential
                // for the public /functions/v1/ics-feed endpoint, so there is NO
                // non-cryptographic fallback: if the runtime cannot produce secure
                // random bytes, we throw rather than ship a predictable token.
                if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
                    throw new PlanterError(
                        'Secure random source unavailable; cannot generate ICS feed token.',
                        500,
                    );
                }
                const tokenBytes = new Uint8Array(32);
                crypto.getRandomValues(tokenBytes);
                const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, '0')).join('');

                const payload = {
                    user_id: user.id,
                    token,
                    label: input.label ?? null,
                    project_filter: input.project_filter ?? null,
                };

                const { data, error } = await supabase
                    .from('ics_feed_tokens')
                    .insert(payload)
                    .select('*')
                    .single();
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return data as IcsFeedTokenRow;
            });
        },
        /**
         * Wave 35 — soft-revoke an ICS feed token by stamping `revoked_at`.
         * The row stays visible for audit trail (last_accessed_at remains
         * queryable). Subsequent fetches against the token's URL return 404.
         *
         * @param id Primary key of the token row to revoke.
         * @returns The updated row (with `revoked_at` set).
         */
        revokeIcsFeedToken: async (id: string): Promise<IcsFeedTokenRow> => {
            return retry(async () => {
                const { data, error } = await supabase
                    .from('ics_feed_tokens')
                    .update({ revoked_at: nowUtcIso() })
                    .eq('id', id)
                    .select('*')
                    .single();
                if (error) throw new PlanterError(error.message, error.code ?? '500');
                return data as IcsFeedTokenRow;
            });
        },
    },
};

export default planter;
