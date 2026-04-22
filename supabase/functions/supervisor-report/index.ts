import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
    dateStringToUtcMidnightMs,
    dateStringToUtcMonthKey,
    toUtcIsoDate,
    toUtcMonthKey,
} from '../_shared/date.ts'
import {
    renderSupervisorReportEmail,
    sendEmail,
    type MilestoneSummary,
    type ProjectReportPayload,
} from '../_shared/email.ts'
import { corsHeaders, isServiceRoleRequest } from '../_shared/auth.ts'

type TaskRow = {
    id: string
    root_id: string | null
    parent_task_id: string | null
    title: string | null
    status: string | null
    is_complete: boolean | null
    due_date: string | null
    updated_at: string | null
    supervisor_email: string | null
}

interface DispatchResult {
    projects_considered: number
    payloads_built: number
    payloads_logged: number
    payloads_dispatched: number
    dispatch_failures: number
}

interface InvocationBody {
    project_id?: string
    dry_run?: boolean
}

const isMilestoneComplete = (m: { status: string | null; is_complete: boolean | null }): boolean =>
    Boolean(m.is_complete) || m.status === 'completed'

/**
 * Build the per-project report payload for the given month. Mirrors the
 * shape produced by `src/features/projects/hooks/useProjectReports.ts` — if
 * that hook's filtering rules change, update this function too.
 */
function buildProjectPayload(
    root: TaskRow,
    allTasks: TaskRow[],
    monthKey: string,
    todayMidnightMs: number,
): ProjectReportPayload {
    const projectTasks = allTasks.filter((t) => t.root_id === root.id)
    const phaseIds = new Set(
        projectTasks.filter((t) => t.parent_task_id === root.id).map((p) => p.id),
    )

    // Milestones: tasks whose parent is a phase.
    const milestones: MilestoneSummary[] = projectTasks
        .filter((t) => t.parent_task_id !== null && phaseIds.has(t.parent_task_id))
        .map((m) => ({
            id: m.id,
            title: m.title,
            due_date: m.due_date,
            status: m.status,
            is_complete: m.is_complete,
            updated_at: m.updated_at,
        }))

    const completedThisMonth = milestones.filter((m) => {
        if (!isMilestoneComplete(m)) return false
        const dueMonth = dateStringToUtcMonthKey(m.due_date)
        const updatedMonth = dateStringToUtcMonthKey(m.updated_at)
        return dueMonth === monthKey || updatedMonth === monthKey
    })

    const overdue = milestones.filter((m) => {
        if (isMilestoneComplete(m)) return false
        const dueMs = dateStringToUtcMidnightMs(m.due_date)
        if (dueMs === null) return false
        return dueMs < todayMidnightMs
    })

    const upcomingThisMonth = milestones.filter((m) => {
        if (isMilestoneComplete(m)) return false
        const dueMonth = dateStringToUtcMonthKey(m.due_date)
        if (dueMonth !== monthKey) return false
        const dueMs = dateStringToUtcMidnightMs(m.due_date)
        if (dueMs === null) return false
        return dueMs >= todayMidnightMs
    })

    return {
        project_id: root.id,
        project_title: root.title,
        supervisor_email: root.supervisor_email ?? '',
        month: monthKey,
        completed_this_month: completedThisMonth,
        overdue,
        upcoming_this_month: upcomingThisMonth,
    }
}

async function fetchProjectRoots(
    supabase: SupabaseClient,
    projectId?: string,
): Promise<TaskRow[]> {
    let query = supabase
        .from('tasks')
        .select('id, root_id, parent_task_id, title, status, is_complete, due_date, updated_at, supervisor_email')
        .is('parent_task_id', null)
        .not('supervisor_email', 'is', null)
    if (projectId) {
        query = query.eq('id', projectId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as TaskRow[]
}

async function fetchTasksForRoots(
    supabase: SupabaseClient,
    rootIds: string[],
): Promise<TaskRow[]> {
    if (rootIds.length === 0) return []
    const { data, error } = await supabase
        .from('tasks')
        .select('id, root_id, parent_task_id, title, status, is_complete, due_date, updated_at, supervisor_email')
        .in('root_id', rootIds)
    if (error) throw error
    return (data ?? []) as TaskRow[]
}

async function parseInvocationBody(req: Request): Promise<InvocationBody> {
    if (req.method !== 'POST') return {}
    try {
        const parsed = (await req.json()) as unknown
        if (parsed && typeof parsed === 'object') {
            return parsed as InvocationBody
        }
    } catch {
        // Ignore malformed bodies — cron invocations send an empty body.
    }
    return {}
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Hybrid auth: supervisor-report is called by BOTH the cron scheduler
        // (service-role JWT, unscoped — processes every project with a
        // supervisor_email) and by the EditProjectModal "Send test" button
        // (authenticated user JWT, scoped to their project_id).
        //
        // - Service-role callers: trust and run unscoped.
        // - User-JWT callers: require body.project_id AND verify the caller
        //   has ownership of that project (via has_permission). This stops
        //   an authenticated user from fanning out supervisor emails across
        //   unrelated projects.
        const authHeader = req.headers.get('Authorization') ?? ''
        // Constant-time bearer match via the shared helper (avoids the
        // short-circuit-on-first-mismatch timing signal of raw `===`).
        const isServiceRole = isServiceRoleRequest(req)

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        // Clone the body so we can both peek at project_id and preserve the
        // original for the downstream parseInvocationBody call.
        const rawBody = await req.clone().text()
        let peekProjectId: string | undefined
        try {
            const parsed = rawBody ? JSON.parse(rawBody) : {}
            peekProjectId = typeof parsed?.project_id === 'string' ? parsed.project_id : undefined
        } catch {
            peekProjectId = undefined
        }

        if (!isServiceRole) {
            if (!authHeader.startsWith('Bearer ')) {
                return new Response(JSON.stringify({ success: false, error: 'Authorization required' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
            if (!peekProjectId) {
                return new Response(JSON.stringify({ success: false, error: 'project_id required for user-invoked calls' }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
            // Resolve the caller's uid from the JWT via a lightweight
            // supabase-auth call under the user's token (NOT service role).
            const userClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_ANON_KEY') ?? '',
                { global: { headers: { Authorization: authHeader } } },
            )
            const { data: userRes, error: userErr } = await userClient.auth.getUser()
            if (userErr || !userRes?.user) {
                return new Response(JSON.stringify({ success: false, error: 'Invalid auth token' }), {
                    status: 401,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
            // Verify ownership via has_permission (SECURITY DEFINER).
            // @ts-expect-error rpc typing is loose for dynamic function names.
            const { data: permOk, error: permErr } = await supabase.rpc('has_permission', {
                p_project_id: peekProjectId,
                p_user_id: userRes.user.id,
                p_required_role: 'owner',
            })
            if (permErr || !permOk) {
                return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
                    status: 403,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                })
            }
        }

        const { project_id, dry_run } = await parseInvocationBody(req)

        const now = new Date()
        const monthKey = toUtcMonthKey(now)
        const todayMidnightMs =
            dateStringToUtcMidnightMs(toUtcIsoDate(now)) ??
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

        const roots = await fetchProjectRoots(supabase, project_id)
        const rootIds = roots.map((r) => r.id)
        const allTasks = await fetchTasksForRoots(supabase, rootIds)

        const providerKey = Deno.env.get('EMAIL_PROVIDER_API_KEY')
        const fromAddress = Deno.env.get('RESEND_FROM_ADDRESS')
        // Only dispatch when BOTH Resend env vars are set — if either is
        // missing, sendEmail would bail out and bump dispatch_failures, so
        // fall through to log-only instead and keep the response truthful.
        const shouldDispatch = Boolean(providerKey) && Boolean(fromAddress) && dry_run !== true
        const result: DispatchResult = {
            projects_considered: roots.length,
            payloads_built: 0,
            payloads_logged: 0,
            payloads_dispatched: 0,
            dispatch_failures: 0,
        }

        for (const root of roots) {
            if (!root.supervisor_email) continue
            const payload = buildProjectPayload(root, allTasks, monthKey, todayMidnightMs)
            result.payloads_built += 1

            if (shouldDispatch) {
                const rendered = renderSupervisorReportEmail(payload)
                const dispatched = await sendEmail({
                    to: root.supervisor_email,
                    subject: rendered.subject,
                    html: rendered.html,
                    text: rendered.text,
                })
                if (dispatched.ok) {
                    result.payloads_dispatched += 1
                } else {
                    result.dispatch_failures += 1
                }
            } else {
                console.log('[supervisor-report] log-only payload', JSON.stringify(payload))
                result.payloads_logged += 1
            }
        }

        return new Response(
            JSON.stringify({ success: true, ...result }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        // Log the raw error server-side; return a generic message to the
        // caller to avoid leaking stack details.
        console.error('[supervisor-report] unhandled error', error)
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
        )
    }
})
