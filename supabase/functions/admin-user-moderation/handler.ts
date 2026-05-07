import { corsHeaders } from '../_shared/auth.ts';

export type ModerationAction = 'suspend' | 'unsuspend' | 'reset_password';

interface ModerationBody {
    action: ModerationAction;
    target_uid: string;
    /** For `suspend` - ban duration in hours. Omit for indefinite (100 years). */
    duration_hours?: number;
}

interface ErrorLike {
    message?: string;
}

interface ModerationUser {
    id: string;
    email?: string | null;
}

interface UserClient {
    auth: {
        getUser: () => Promise<{
            data: { user: ModerationUser | null };
            error: ErrorLike | null;
        }>;
    };
}

interface AdminClient {
    auth: {
        admin: {
            getUserById: (uid: string) => Promise<{
                data: { user: ModerationUser | null } | null;
                error: ErrorLike | null;
            }>;
            updateUserById: (
                uid: string,
                attributes: Record<string, unknown>,
            ) => Promise<{ error: ErrorLike | null }>;
            generateLink: (params: { type: 'recovery'; email: string }) => Promise<{
                data: { properties?: { action_link?: string } } | null;
                error: ErrorLike | null;
            }>;
        };
    };
    rpc: <T = unknown>(
        fn: string,
        args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: ErrorLike | null }>;
    from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error: ErrorLike | null }>;
    };
}

export type AdminModerationCreateClient = (
    supabaseUrl: string,
    key: string,
    options?: { global?: { headers?: Record<string, string> } },
) => UserClient | AdminClient;

export interface AdminModerationHandlerDeps {
    getEnv: (key: string) => string | undefined;
    createClient: AdminModerationCreateClient;
    logger?: Pick<Console, 'error'>;
}

// Supabase's `ban_duration` accepts a string like '24h'. For effectively
// indefinite suspensions we use ~100 years; admins can always unsuspend later.
// '876000h' = 100*365.25*24.
const INDEFINITE_BAN = '876000h';

/**
 * Handles admin-only moderation actions behind the Supabase Edge Function.
 *
 * Auth flow:
 *   1. Extract caller from their user JWT via anon client.
 *   2. Verify caller is in `admin_users` via `public.is_admin` RPC.
 *   3. Self-protection: reject if target_uid === caller.id for suspension.
 *   4. Call the admin API via service-role client.
 *   5. Write an `activity_log` entry so the action surfaces in admin activity.
 *
 * @param req - Incoming Edge Function request.
 * @param deps - Runtime dependencies injected by `index.ts` and unit tests.
 * @returns JSON `Response` with the moderation result.
 */
export async function handleAdminUserModerationRequest(
    req: Request,
    deps: AdminModerationHandlerDeps,
): Promise<Response> {
    const logger = deps.logger ?? console;

    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return json({ success: false, error: 'Method Not Allowed' }, 405);
    }

    try {
        const supabaseUrl = deps.getEnv('SUPABASE_URL');
        const supabaseAnonKey = deps.getEnv('SUPABASE_ANON_KEY');
        const serviceRoleKey = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
            return json({ success: false, error: 'Server configuration error' }, 500);
        }

        // Parse body early so we can validate before any auth I/O. JSON
        // literals like `null`, strings, and arrays are invalid payloads but
        // should still return the normal product-level validation response.
        const rawBody = await req.json().catch(() => ({}));
        const body: Partial<ModerationBody> =
            rawBody !== null && typeof rawBody === 'object' && !Array.isArray(rawBody)
                ? rawBody as Partial<ModerationBody>
                : {};
        const { action, target_uid, duration_hours } = body;

        if (!action || !['suspend', 'unsuspend', 'reset_password'].includes(action)) {
            return json({ success: false, error: 'Invalid action' }, 200);
        }
        if (!target_uid || typeof target_uid !== 'string') {
            return json({ success: false, error: 'target_uid required' }, 200);
        }

        // 1. Extract caller from user JWT.
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            // Genuine HTTP auth failure - 401 is the right status.
            return json({ success: false, error: 'Authorization required' }, 401);
        }
        const userClient = deps.createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        }) as UserClient;
        const { data: { user: caller }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !caller) {
            // Bad bearer - HTTP auth failure, 401.
            return json({ success: false, error: 'Invalid session' }, 401);
        }

        // 2. Verify caller is admin. The SECURITY DEFINER RPC is called with
        // the service-role client because RLS intentionally denies direct reads
        // of `admin_users`; the function checks the caller id explicitly.
        const adminClient = deps.createClient(supabaseUrl, serviceRoleKey) as AdminClient;
        const { data: isAdminResult, error: isAdminErr } = await adminClient.rpc<boolean>('is_admin', {
            p_user_id: caller.id,
        });
        if (isAdminErr) {
            logger.error('[admin-user-moderation] is_admin check failed', isAdminErr);
            // Infra problem (RPC unreachable / misconfigured) - genuine 500.
            return json({ success: false, error: 'Authorization check failed' }, 500);
        }
        if (!isAdminResult) {
            // Product-level: caller is authenticated but not an admin. 200 so
            // the client's error branch can surface the specific message.
            return json({ success: false, error: 'unauthorized: admin role required' }, 200);
        }

        // 3. Self-protection: disallow self-suspend/unsuspend so admins cannot
        // accidentally lock themselves out. Reset-password on self is harmless.
        if ((action === 'suspend' || action === 'unsuspend') && target_uid === caller.id) {
            return json({ success: false, error: 'self_moderation_forbidden' }, 200);
        }

        // 4. Load the target for activity-log context + email (reset-password
        // needs the email for generateLink).
        const { data: targetData, error: targetErr } = await adminClient.auth.admin.getUserById(target_uid);
        if (targetErr || !targetData?.user) {
            return json({ success: false, error: 'target_not_found' }, 200);
        }
        const targetEmail = targetData.user.email;

        // 5. Perform the action.
        let activityAction: string;
        const activityPayload: Record<string, unknown> = { target_email: targetEmail };
        let resetLink: string | undefined;

        if (action === 'suspend') {
            const banDuration = typeof duration_hours === 'number' && duration_hours > 0
                ? `${Math.ceil(duration_hours)}h`
                : INDEFINITE_BAN;
            const { error } = await adminClient.auth.admin.updateUserById(target_uid, {
                ban_duration: banDuration,
            });
            if (error) {
                logger.error('[admin-user-moderation] suspend failed', error);
                // Admin API errors are product-level from the caller's POV.
                return json({ success: false, error: error.message || 'Suspend failed' }, 200);
            }
            activityAction = 'user_suspended';
            activityPayload.duration = banDuration;
        } else if (action === 'unsuspend') {
            const { error } = await adminClient.auth.admin.updateUserById(target_uid, {
                ban_duration: 'none',
            });
            if (error) {
                logger.error('[admin-user-moderation] unsuspend failed', error);
                return json({ success: false, error: error.message || 'Unsuspend failed' }, 200);
            }
            activityAction = 'user_unsuspended';
        } else {
            // reset_password
            if (!targetEmail) {
                return json({ success: false, error: 'target_has_no_email' }, 200);
            }
            const { data: linkData, error } = await adminClient.auth.admin.generateLink({
                type: 'recovery',
                email: targetEmail,
            });
            if (error) {
                logger.error('[admin-user-moderation] generateLink failed', error);
                return json({ success: false, error: error.message || 'Reset link generation failed' }, 200);
            }
            resetLink = linkData?.properties?.action_link;
            activityAction = 'password_reset_requested';
            // Intentionally do NOT log the reset link. It is credential-like
            // and should only exist in the direct function response.
        }

        // 6. Activity log - service_role bypasses the policy-level INSERT
        // block on activity_log. The insert outcome is intentionally
        // non-blocking because the moderation action has already succeeded.
        const { error: auditErr } = await adminClient.from('activity_log').insert({
            project_id: null,
            actor_id: caller.id,
            entity_type: 'member',
            entity_id: target_uid,
            action: activityAction,
            payload: activityPayload,
        });
        if (auditErr) {
            logger.error('[admin-user-moderation] activity_log insert failed (action still applied)', auditErr);
        }

        return json({ success: true, reset_link: resetLink }, 200);
    } catch (err) {
        logger.error('[admin-user-moderation] unhandled exception', err);
        return json({ success: false, error: 'Moderation failed' }, 500);
    }
}

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
