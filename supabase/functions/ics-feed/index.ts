import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderIcsDocument, type IcsTaskRow } from './ics.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
 * have a non-null `due_date`, and fall inside `[now - 30d, +∞)`. Optional
 * `project_filter` narrows by `root_id IN (...)`.
 */

// @ts-expect-error -- Deno global in edge runtime, not available in browser TS
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    if (!token || token.length < 16) {
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return new Response('Server misconfigured', { status: 500, headers: corsHeaders });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: tokenRow, error: tokenErr } = await admin
        .from('ics_feed_tokens')
        .select('id, user_id, project_filter, revoked_at')
        .eq('token', token)
        .maybeSingle();

    if (tokenErr) {
        console.error('[ics-feed] token lookup error', tokenErr);
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    if (!tokenRow || tokenRow.revoked_at !== null) {
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    // Bump last_accessed_at. Awaited because Deno's edge runtime cancels
    // unawaited promises the moment the Response is returned — the old
    // fire-and-forget approach left last_accessed_at permanently stale on
    // most environments. The extra ~20ms of latency is imperceptible for
    // calendar-subscriber polling.
    {
        const { error: stampError } = await admin
            .from('ics_feed_tokens')
            .update({ last_accessed_at: new Date().toISOString() })
            .eq('id', tokenRow.id);
        if (stampError) console.warn('[ics-feed] failed to bump last_accessed_at', stampError);
    }

    const windowStart = new Date();
    windowStart.setUTCDate(windowStart.getUTCDate() - 30);

    let query = admin
        .from('tasks')
        .select('id, title, description, due_date, start_date, status, root_id')
        .eq('assignee_id', tokenRow.user_id)
        .not('due_date', 'is', null)
        .gte('due_date', windowStart.toISOString().slice(0, 10))
        .order('due_date', { ascending: true })
        .limit(500);

    if (Array.isArray(tokenRow.project_filter) && tokenRow.project_filter.length > 0) {
        query = query.in('root_id', tokenRow.project_filter);
    }

    const { data: tasks, error: taskErr } = await query;

    if (taskErr) {
        console.error('[ics-feed] task fetch error', taskErr);
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    const icsBody = renderIcsDocument((tasks ?? []) as IcsTaskRow[], {
        calendarName: 'PlanterPlan',
        feedUrl: url.toString(),
    });

    return new Response(icsBody, {
        status: 200,
        headers: {
            ...corsHeaders,
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'private, max-age=300',
            // Suggest a filename to browsers that open the URL directly.
            'Content-Disposition': 'inline; filename="planterplan.ics"',
        },
    });
});
