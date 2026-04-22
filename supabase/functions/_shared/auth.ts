// Shared edge-function auth helper.
//
// These dispatcher / cron functions are meant to be invoked by:
//   1. The Supabase scheduler (service-role JWT).
//   2. Other edge functions that already authenticated.
//   3. Ops tooling with the service role key.
//
// They should NOT accept arbitrary `authenticated` JWTs — those users
// could fan out Web Push / email to other users with attacker-controlled
// content (phishing vector under the app's VAPID subject / RESEND domain).
//
// Each function calls `requireServiceRole(req)` at the top of its handler;
// the helper returns a 403 Response if the Authorization header doesn't
// match the SUPABASE_SERVICE_ROLE_KEY, or `null` when the caller is
// authorized (null means "continue").

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const

/**
 * Constant-time string comparison. Defense-in-depth against timing side
 * channels on the bearer-token match: even though edge-runtime jitter
 * would likely swamp any CPU-level timing, the V8 `!==` on strings short-
 * circuits at the first mismatching byte, so we use a branch-less XOR
 * fold instead. Length mismatches short-circuit early (keys have fixed
 * length for the caller shape `Bearer <service-role-jwt>`).
 */
function constantTimeEquals(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    }
    return diff === 0
}

/**
 * Returns true iff the request's `Authorization` header matches the
 * service-role bearer token under constant-time comparison. Returns
 * false when the server is misconfigured (the caller should then
 * fall through to user-JWT handling if they have a hybrid path, or
 * surface a 500 via {@link requireServiceRole}).
 */
export function isServiceRoleRequest(req: Request): boolean {
    const header = req.headers.get('Authorization') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) return false
    return constantTimeEquals(header, `Bearer ${serviceKey}`)
}

export function requireServiceRole(req: Request): Response | null {
    const header = req.headers.get('Authorization') ?? ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) {
        console.error('[auth] SUPABASE_SERVICE_ROLE_KEY not configured')
        return new Response('Server misconfigured', {
            status: 500,
            headers: corsHeaders,
        })
    }
    if (!constantTimeEquals(header, `Bearer ${serviceKey}`)) {
        return new Response('Forbidden', {
            status: 403,
            headers: corsHeaders,
        })
    }
    return null
}
