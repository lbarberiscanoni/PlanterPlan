import { corsHeaders } from '../_shared/auth.ts';
import { calendarDayBusinessCalendar } from '../_shared/business-calendar.ts';
import { getNow, toUtcIsoDate } from '../_shared/date.ts';
import { renderIcsDocument, type IcsTaskRow } from './ics.ts';

export interface IcsTokenRow {
    id: string;
    user_id: string;
    project_filter: string[] | null;
    revoked_at: string | null;
}

interface IcsProjectMemberRow {
    project_id: string;
}

interface SupabaseErrorLike {
    message: string;
}

interface SelectFilter<T> extends PromiseLike<{ data: T[] | null; error: SupabaseErrorLike | null }> {
    eq(col: string, value: string): SelectFilter<T>;
    not(col: string, op: string, value: unknown): SelectFilter<T>;
    gte(col: string, value: string): SelectFilter<T>;
    order(col: string, opts: { ascending: boolean }): SelectFilter<T>;
    limit(n: number): SelectFilter<T>;
    in(col: string, values: string[]): SelectFilter<T>;
    maybeSingle(): Promise<{ data: T | null; error: SupabaseErrorLike | null }>;
}

interface UpdateFilter<T> extends PromiseLike<{ data: T[] | null; error: SupabaseErrorLike | null }> {
    eq(col: string, value: string): UpdateFilter<T>;
}

export interface IcsSupabaseLike {
    from(table: string): {
        select<T = unknown>(cols: string): SelectFilter<T>;
        update<T = unknown>(patch: Record<string, unknown>): UpdateFilter<T>;
    };
}

export interface IcsFeedHandlerDeps {
    supabase?: IcsSupabaseLike;
    now?: Date;
}

/**
 * Testable implementation for the public ICS edge endpoint. The Deno entry
 * point only injects env-backed Supabase; security and filtering stay here.
 */
export async function handleIcsFeedRequest(req: Request, deps: IcsFeedHandlerDeps): Promise<Response> {
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

    if (!deps.supabase) {
        return new Response('Server misconfigured', { status: 500, headers: corsHeaders });
    }

    const { data: tokenRow, error: tokenErr } = await deps.supabase
        .from('ics_feed_tokens')
        .select<IcsTokenRow>('id, user_id, project_filter, revoked_at')
        .eq('token', token)
        .maybeSingle();

    if (tokenErr) {
        console.error('[ics-feed] token lookup error', tokenErr);
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    if (!tokenRow || tokenRow.revoked_at !== null) {
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    const now = deps.now ?? getNow();

    const { error: stampError } = await deps.supabase
        .from('ics_feed_tokens')
        .update({ last_accessed_at: now.toISOString() })
        .eq('id', tokenRow.id);
    if (stampError) console.warn('[ics-feed] failed to bump last_accessed_at', stampError);

    const { data: memberships, error: membershipErr } = await deps.supabase
        .from('project_members')
        .select<IcsProjectMemberRow>('project_id')
        .eq('user_id', tokenRow.user_id);

    if (membershipErr) {
        console.error('[ics-feed] membership lookup error', membershipErr);
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    const memberProjectIds = (memberships ?? [])
        .map((membership) => membership.project_id)
        .filter((projectId): projectId is string => typeof projectId === 'string' && projectId.length > 0);
    const projectScope = Array.isArray(tokenRow.project_filter) && tokenRow.project_filter.length > 0
        ? memberProjectIds.filter((projectId) => tokenRow.project_filter?.includes(projectId))
        : memberProjectIds;

    if (projectScope.length === 0) {
        const emptyBody = renderIcsDocument([], {
            calendarName: 'PlanterPlan',
            feedUrl: url.toString(),
        });
        return new Response(emptyBody, {
            status: 200,
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/calendar; charset=utf-8',
                'Cache-Control': 'private, max-age=300',
                'Content-Disposition': 'inline; filename="planterplan.ics"',
            },
        });
    }

    const windowStart = calendarDayBusinessCalendar.addBusinessDays(toUtcIsoDate(now), -30);
    if (!windowStart) {
        console.error('[ics-feed] failed to calculate task feed window start');
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    const query = deps.supabase
        .from('tasks')
        .select<IcsTaskRow>('id, title, description, due_date, start_date, status, root_id')
        .eq('assignee_id', tokenRow.user_id)
        .not('due_date', 'is', null)
        .in('root_id', projectScope)
        .gte('due_date', windowStart)
        .order('due_date', { ascending: true })
        .limit(500);

    const { data: tasks, error: taskErr } = await query;

    if (taskErr) {
        console.error('[ics-feed] task fetch error', taskErr);
        return new Response('Server error', { status: 500, headers: corsHeaders });
    }

    const icsBody = renderIcsDocument(tasks ?? [], {
        calendarName: 'PlanterPlan',
        feedUrl: url.toString(),
    });

    return new Response(icsBody, {
        status: 200,
        headers: {
            ...corsHeaders,
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'private, max-age=300',
            'Content-Disposition': 'inline; filename="planterplan.ics"',
        },
    });
}
