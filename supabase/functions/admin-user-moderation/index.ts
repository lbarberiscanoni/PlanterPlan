import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/auth.ts';

/**
 * Admin-only moderation endpoint. Shared home for the destructive actions
 * that require Supabase's admin API (not expressible as a SECURITY DEFINER
 * RPC because they call `auth.admin.*`):
 *
 *   - action: 'suspend'          — bans the target for `duration_hours`
 *                                   (or effectively-indefinite if omitted).
 *   - action: 'unsuspend'        — clears the ban.
 *   - action: 'reset_password'   — generates a password-recovery link.
 *                                   Returns the URL so the admin can copy
 *                                   and share it out-of-band.
 *
 * Auth flow (authorize-then-escalate, matches `invite-by-email`):
 *   1. Extract caller from their user JWT via anon client.
 *   2. Verify caller is in `admin_users` via `public.is_admin` RPC.
 *   3. Self-protection: reject if target_uid === caller.id.
 *   4. Call the admin API via service-role client.
 *   5. Write an `activity_log` entry so the action surfaces in
 *      `admin_recent_activity`.
 *   6. Return `{ success: true, ...details }`.
 *
 * Response shape:
 *   - **HTTP 200** `{ success: true, reset_link? }` on success.
 *   - **HTTP 200** `{ success: false, error: <message> }` for product-level
 *     failures (invalid action, target not found, self-moderation, auth
 *     API errors). 200-with-success=false is used so `supabase.functions
 *     .invoke` doesn't wrap the response in a `FunctionsHttpError` —
 *     which would lose the specific `error` string and surface a generic
 *     "non-2xx status code" to the user. The client checks `data.success`.
 *   - **HTTP 401** for missing / invalid caller JWT.
 *   - **HTTP 500** only for truly catastrophic failures (missing env vars,
 *     unhandled exceptions). Those genuinely are server errors.
 */

type ModerationAction = 'suspend' | 'unsuspend' | 'reset_password';

interface ModerationBody {
    action: ModerationAction;
    target_uid: string;
    /** For `suspend` — ban duration in hours. Omit for indefinite (100 years). */
    duration_hours?: number;
}

// Supabase's `ban_duration` accepts a string like '24h'. For effectively-
// indefinite suspensions we use ~100 years; admins can always unsuspend
// later. '876000h' = 100*365.25*24.
const INDEFINITE_BAN = '876000h';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return json({ success: false, error: 'Method Not Allowed' }, 405);
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
            return json({ success: false, error: 'Server configuration error' }, 500);
        }

        // Parse body early so we can validate before any I/O.
        const body: Partial<ModerationBody> = await req.json().catch(() => ({}));
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
            // Genuine HTTP auth failure — 401 is the right status.
            return json({ success: false, error: 'Authorization required' }, 401);
        }
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: { user: caller }, error: userErr } = await userClient.auth.getUser();
        if (userErr || !caller) {
            // Bad bearer — HTTP auth failure, 401.
            return json({ success: false, error: 'Invalid session' }, 401);
        }

        // 2. Verify caller is admin. Using the anon-authed client routes
        //    through RLS on admin_users which requires service_role for
        //    SELECT, so we use the SECURITY DEFINER `is_admin` RPC.
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        // Param name matches the existing RPC signature
        // `is_admin(p_user_id uuid)` — every other caller in the tree
        // passes `p_user_id`. PostgREST matches named parameters, so the
        // key has to be exact; `uid` would silently fail the call.
        // @ts-expect-error rpc typing is loose for dynamic function names
        const { data: isAdminResult, error: isAdminErr } = await adminClient.rpc('is_admin', {
            p_user_id: caller.id,
        });
        if (isAdminErr) {
            console.error('[admin-user-moderation] is_admin check failed', isAdminErr);
            // Infra problem (RPC unreachable / misconfigured) — genuine 500.
            return json({ success: false, error: 'Authorization check failed' }, 500);
        }
        if (!isAdminResult) {
            // Product-level: caller is authenticated but not an admin. 200 so
            // the client's error branch can surface the specific message.
            return json({ success: false, error: 'unauthorized: admin role required' }, 200);
        }

        // 3. Self-protection: disallow self-suspend (indistinguishable
        //    from self-demotion — admin can accidentally lock themselves
        //    out). Reset-password on self is harmless and allowed.
        if ((action === 'suspend' || action === 'unsuspend') && target_uid === caller.id) {
            return json({ success: false, error: 'self_moderation_forbidden' }, 200);
        }

        // 4. Load the target for activity-log context + email (reset-password
        //    needs the email for generateLink).
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
                ? `${Math.floor(duration_hours)}h`
                : INDEFINITE_BAN;
            const { error } = await adminClient.auth.admin.updateUserById(target_uid, {
                // @ts-expect-error ban_duration is valid per Supabase admin API
                //   but missing from @supabase/supabase-js type defs in older versions.
                ban_duration: banDuration,
            });
            if (error) {
                console.error('[admin-user-moderation] suspend failed', error);
                // Admin API errors are product-level from the caller's POV —
                // return 200 so the specific message (e.g. bad ban_duration)
                // surfaces through supabase-js invoke without a generic wrap.
                return json({ success: false, error: error.message || 'Suspend failed' }, 200);
            }
            activityAction = 'user_suspended';
            activityPayload.duration = banDuration;
        } else if (action === 'unsuspend') {
            const { error } = await adminClient.auth.admin.updateUserById(target_uid, {
                // @ts-expect-error same as above — 'none' clears the ban.
                ban_duration: 'none',
            });
            if (error) {
                console.error('[admin-user-moderation] unsuspend failed', error);
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
                console.error('[admin-user-moderation] generateLink failed', error);
                return json({ success: false, error: error.message || 'Reset link generation failed' }, 200);
            }
            resetLink = linkData?.properties?.action_link;
            activityAction = 'password_reset_requested';
            // Intentionally do NOT log the reset link — it's a credential
            // with a short TTL and admin-level logs shouldn't hold it.
        }

        // 6. Activity log — service_role bypasses the policy-level INSERT
        //    block on activity_log (Wave 27 denies at policy level).
        //    The insert's outcome is intentionally non-blocking: the
        //    moderation action already succeeded above, so failing the
        //    whole request to report a missing audit entry would leave
        //    the admin in a "did it actually suspend?" limbo. Log the
        //    failure server-side instead. Operators can reconcile from
        //    the auth.users.banned_until column if the audit trail is
        //    ever found incomplete.
        const { error: auditErr } = await adminClient.from('activity_log').insert({
            project_id: null,
            actor_id: caller.id,
            entity_type: 'member',
            entity_id: target_uid,
            action: activityAction,
            payload: activityPayload,
        });
        if (auditErr) {
            console.error('[admin-user-moderation] activity_log insert failed (action still applied)', auditErr);
        }

        return json({ success: true, reset_link: resetLink });
    } catch (err) {
        console.error('[admin-user-moderation] unhandled exception', err);
        return json({ success: false, error: 'Moderation failed' }, 500);
    }
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}
