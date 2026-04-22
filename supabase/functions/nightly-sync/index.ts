import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isRecurrenceRule, shouldFireRecurrenceOn, RecurrenceRule } from '../_shared/recurrence.ts'
import { isCheckpointProject, toUtcIsoDate } from '../_shared/date.ts'
import { corsHeaders, requireServiceRole } from '../_shared/auth.ts'

const DEFAULT_DUE_SOON_THRESHOLD_DAYS = 3

type TaskRow = {
    id: string
    root_id: string | null
    due_date: string | null
    status: string | null
    is_complete: boolean | null
    settings: Record<string, unknown> | null
}

type TemplateRow = {
    id: string
    creator: string | null
    settings: Record<string, unknown> | null
}

interface SyncResult {
    overdue: number
    due_soon: number
    recurrence_spawned: number
    recurrence_skipped: number
    overdue_ids: string[]
    due_soon_ids: string[]
    recurrence_spawned_ids: string[]
}

/**
 * Build a map of rootId → due_soon_threshold days plus a set of rootIds whose
 * settings identify them as checkpoint projects (Wave 29). Loads the root
 * tasks referenced by `rootIds` in one query. Falls back to
 * DEFAULT_DUE_SOON_THRESHOLD_DAYS for any root whose settings don't set a
 * threshold.
 */
async function loadRootInfo(
    supabase: SupabaseClient,
    rootIds: string[],
): Promise<{ thresholds: Map<string, number>; checkpointRoots: Set<string> }> {
    const unique = Array.from(new Set(rootIds.filter(Boolean)))
    const thresholds = new Map<string, number>()
    const checkpointRoots = new Set<string>()
    if (unique.length === 0) return { thresholds, checkpointRoots }

    const { data, error } = await supabase
        .from('tasks')
        .select('id, parent_task_id, settings')
        .in('id', unique)
    if (error) throw error

    for (const row of (data ?? []) as Array<{ id: string; parent_task_id: string | null; settings: Record<string, unknown> | null }>) {
        let threshold = DEFAULT_DUE_SOON_THRESHOLD_DAYS
        const s = row.settings
        if (s && typeof s === 'object' && !Array.isArray(s)) {
            const raw = (s as Record<string, unknown>).due_soon_threshold
            const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
            if (Number.isFinite(n) && n >= 0) threshold = Math.floor(n)
        }
        thresholds.set(row.id, threshold)
        if (isCheckpointProject(row)) checkpointRoots.add(row.id)
    }
    return { thresholds, checkpointRoots }
}

/**
 * Recurrence-clone pass. For each template task with a valid `settings.recurrence`
 * rule that fires today, clone the template into the configured target project
 * as an instance task. The clone stamps `settings.spawnedFromTemplate` +
 * `settings.spawnedOn` so a same-day re-run is a no-op.
 */
async function runRecurrencePass(
    supabase: SupabaseClient,
    nowUtc: Date,
    nowIso: string,
): Promise<{ spawnedIds: string[]; skipped: number }> {
    const todayIso = toUtcIsoDate(nowUtc)
    const spawnedIds: string[] = []
    let skipped = 0

    // Pull candidate templates. JSONB filter: `settings -> 'recurrence'` is not null.
    const { data, error } = await supabase
        .from('tasks')
        .select('id, creator, settings')
        .eq('origin', 'template')
        .not('settings->recurrence', 'is', null)
    if (error) throw error

    const templates = (data ?? []) as TemplateRow[]
    for (const tmpl of templates) {
        const rule = (tmpl.settings ?? {}).recurrence as unknown
        if (!isRecurrenceRule(rule)) continue
        const valid = rule as RecurrenceRule

        if (!shouldFireRecurrenceOn(valid, nowUtc)) continue

        // Idempotency: skip if we already spawned this template into this
        // target on this UTC day.
        const { data: existing, error: existErr } = await supabase
            .from('tasks')
            .select('id')
            .eq('origin', 'instance')
            .eq('parent_task_id', valid.targetProjectId)
            .eq('settings->>spawnedFromTemplate', tmpl.id)
            .eq('settings->>spawnedOn', todayIso)
            .limit(1)
        if (existErr) throw existErr
        if ((existing ?? []).length > 0) {
            skipped += 1
            continue
        }

        // Deep-clone via the existing RPC, then stamp provenance on the root.
        const { data: cloned, error: cloneErr } = await supabase.rpc('clone_project_template', {
            p_template_id: tmpl.id,
            p_new_parent_id: valid.targetProjectId,
            p_new_origin: 'instance',
            p_user_id: tmpl.creator,
            p_start_date: todayIso,
            p_due_date: todayIso,
        })
        if (cloneErr) {
            console.error('[nightly-sync] recurrence clone failed', { templateId: tmpl.id, cloneErr })
            continue
        }

        // The RPC returns `{ new_root_id, root_project_id, tasks_cloned }`
        // (see `clone_project_template` in docs/db/schema.sql). Narrow to a
        // non-empty string so the idempotency stamp below actually lands.
        const clonedId = ((): string | null => {
            if (typeof cloned === 'string') return cloned
            if (cloned && typeof cloned === 'object' && 'new_root_id' in cloned) {
                const v = (cloned as { new_root_id: unknown }).new_root_id
                return typeof v === 'string' && v.length > 0 ? v : null
            }
            return null
        })()
        if (clonedId) {
            // Merge the template's settings into the stamp and explicitly
            // strip the recurrence rule — instances must never carry the
            // spawn rule, even if a future change starts copying settings
            // through the RPC.
            const stampedSettings: Record<string, unknown> = {
                ...(tmpl.settings ?? {}),
                spawnedFromTemplate: tmpl.id,
                spawnedOn: todayIso,
            }
            delete stampedSettings.recurrence
            const { error: stampErr } = await supabase
                .from('tasks')
                .update({
                    settings: stampedSettings,
                    updated_at: nowIso,
                })
                .eq('id', clonedId)
            if (stampErr) {
                console.error('[nightly-sync] recurrence stamp failed', { clonedId, stampErr })
                continue
            }
            spawnedIds.push(clonedId)
        }
    }

    return { spawnedIds, skipped }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    // Security: cron-only. Reject non-service-role callers — nightly-sync
    // writes status updates across every project and spawns recurrence
    // clones; must not be callable by end users.
    const authFail = requireServiceRole(req)
    if (authFail) return authFail

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const nowIso = new Date().toISOString()

        // 1. Transition past-due, incomplete tasks to 'overdue'.
        //    Select candidates first so we can filter out tasks in checkpoint projects
        //    (Wave 29: those project kinds treat due_dates as informational only).
        const { data: overdueCandidates, error: overdueCandErr } = await supabase
            .from('tasks')
            .select('id, root_id')
            .lt('due_date', nowIso)
            .neq('status', 'completed')
            .neq('status', 'overdue')
            .eq('is_complete', false)
        if (overdueCandErr) throw overdueCandErr

        // 2. Pre-fetch candidates for the due_soon pass so we can load root info once
        //    covering BOTH passes. Checkpoint filtering is applied AFTER loadRootInfo
        //    using each root's settings; the per-task `settings` column isn't needed.
        const { data: dueSoonCandidates, error: dueSoonCandErr } = await supabase
            .from('tasks')
            .select('id, root_id, due_date, status, is_complete')
            .gte('due_date', nowIso)
            .eq('is_complete', false)
            .not('status', 'in', '("completed","overdue","due_soon")')
        if (dueSoonCandErr) throw dueSoonCandErr

        type DueSoonCandidate = Omit<TaskRow, 'settings'>
        const overdueCandRows = (overdueCandidates ?? []) as Array<{ id: string; root_id: string | null }>
        const dueSoonCandRows = (dueSoonCandidates ?? []) as DueSoonCandidate[]
        const rootIds = [
            ...overdueCandRows.map((r) => r.root_id),
            ...dueSoonCandRows.map((r) => r.root_id),
        ].filter((v): v is string => typeof v === 'string' && v.length > 0)
        const { thresholds, checkpointRoots } = await loadRootInfo(supabase, rootIds)

        const overdueIds = overdueCandRows
            .filter((r) => !(r.root_id && checkpointRoots.has(r.root_id)))
            .map((r) => r.id)

        if (overdueIds.length > 0) {
            const { error: overdueUpdateErr } = await supabase
                .from('tasks')
                .update({ status: 'overdue', updated_at: nowIso })
                .in('id', overdueIds)
            if (overdueUpdateErr) throw overdueUpdateErr
        }

        const nowMs = new Date(nowIso).getTime()
        const dueSoonIds: string[] = []
        for (const row of dueSoonCandRows) {
            if (!row.due_date) continue
            if (row.root_id && checkpointRoots.has(row.root_id)) continue
            const threshold = row.root_id
                ? thresholds.get(row.root_id) ?? DEFAULT_DUE_SOON_THRESHOLD_DAYS
                : DEFAULT_DUE_SOON_THRESHOLD_DAYS
            const dueMs = new Date(row.due_date).getTime()
            if (Number.isNaN(dueMs)) continue
            const cutoffMs = nowMs + threshold * 24 * 60 * 60 * 1000
            if (dueMs <= cutoffMs) dueSoonIds.push(row.id)
        }

        if (dueSoonIds.length > 0) {
            const { error: updateErr } = await supabase
                .from('tasks')
                .update({ status: 'due_soon', updated_at: nowIso })
                .in('id', dueSoonIds)
            if (updateErr) throw updateErr
        }

        // 3. Recurrence pass: clone matching template tasks into their target
        //    project roots. Idempotent — if an instance already exists for
        //    (template, target, today) we skip the spawn.
        const recurrence = await runRecurrencePass(supabase, new Date(nowIso), nowIso)

        const result: SyncResult = {
            overdue: overdueIds.length,
            due_soon: dueSoonIds.length,
            recurrence_spawned: recurrence.spawnedIds.length,
            recurrence_skipped: recurrence.skipped,
            overdue_ids: overdueIds,
            due_soon_ids: dueSoonIds,
            recurrence_spawned_ids: recurrence.spawnedIds,
        }

        return new Response(
            JSON.stringify({ success: true, ...result }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
    } catch (error) {
        // Log the raw error server-side; return a generic message to the
        // caller to avoid leaking stack details.
        console.error('[nightly-sync] unhandled error', error)
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
        )
    }
})
