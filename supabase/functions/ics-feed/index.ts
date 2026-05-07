import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleIcsFeedRequest } from './handler.ts';

// @ts-expect-error -- Deno global in edge runtime, not available in browser TS
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error -- Deno global in edge runtime, not available in browser TS
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/**
 * Wave 35 — public ICS feed endpoint.
 *
 *   GET /functions/v1/ics-feed?token=<opaque>
 *
 * Returns `text/calendar` (RFC 5545). Auth is the token itself; no Supabase
 * auth header required. Revoked tokens → 404 (indistinguishable from unknown,
 * by design). Success bumps `last_accessed_at`.
 *
 * The tasks returned are filtered to the token's `user_id` as `assignee_id`,
 * intersected with current project membership, have a non-null `due_date`, and
 * fall inside `[now - 30d, +∞)`. Optional `project_filter` narrows by `root_id`.
 */

// @ts-expect-error -- Deno global in edge runtime, not available in browser TS
Deno.serve(async (req: Request) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return handleIcsFeedRequest(req, {});

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // @ts-expect-error the Deno Supabase client has a wider generic surface than the pure handler requires; the runtime chain contract is identical.
    return handleIcsFeedRequest(req, { supabase: admin });
});
