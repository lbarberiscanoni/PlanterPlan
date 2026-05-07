// Pure dispatch loop for mention notifications. Factored out of `index.ts`
// so vitest can import + drive the state machine without spinning up
// Deno.serve or esm.sh. The Deno entry point injects the real Supabase
// client + real email/push transports; tests inject mocks.
//
// State machine per `notification_log` row:
//   mention_pending → mention_processing → mention_sent | mention_failed | mention_skipped
//
// Single-runner-per-row via `UPDATE ... WHERE event_type = <previous_state>`:
// only the first concurrent runner wins the UPDATE and gets RETURNING rows.
// All others get an empty result and move on. This provides idempotency
// without a distributed lock.

import {
    inQuietHours,
    type NotificationPrefsLite,
} from '../_shared/notification-prefs.ts'

export interface PendingMentionRow {
    id: string
    user_id: string
    event_type: 'mention_pending'
    payload: {
        recipient_id?: string
        actor_id?: string
        author_id?: string
        comment_id?: string
        task_id?: string
        project_id?: string
        root_id?: string
        body_preview?: string
    }
}

export interface MentionPrefsLite extends NotificationPrefsLite {
    email_mentions: boolean
}

export interface AuthUserLite {
    id: string
    email: string | null
}

export interface EmailSendResult {
    ok: boolean
    id?: string
    error?: string
}

export type EmailSender = (to: string, subject: string, html: string, text: string) => Promise<EmailSendResult>

export interface PushInvokeResult {
    ok: boolean
    sent?: number
    skipped?: number
    failed?: number
    error?: string
}

/** Invokes the sibling `dispatch-push` edge function. */
export type PushInvoker = (input: {
    user_ids: string[]
    title: string
    body: string
    url?: string
    tag?: string
    event_type: 'mentions' | 'overdue' | 'assignment'
}) => Promise<PushInvokeResult>

/** Thenable builder for SELECT chains. Mirrors PostgrestFilterBuilder's shape. */
export interface SelectFilter<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
    eq(col: string, value: string): SelectFilter<T>
    in(col: string, values: string[]): SelectFilter<T>
    limit(n: number): SelectFilter<T>
}

/** Thenable builder for UPDATE chains. Mirrors PostgrestFilterBuilder's shape. */
export interface UpdateFilter<T> extends PromiseLike<{ data: T[] | null; error: { message: string } | null }> {
    eq(col: string, value: string): UpdateFilter<T>
    select(): UpdateFilter<T>
}

export interface SupabaseLike {
    from: (table: string) => {
        select: <T = unknown>(cols: string) => SelectFilter<T>
        update: <T = unknown>(patch: Record<string, unknown>) => UpdateFilter<T>
    }
}

export interface DispatchSummary {
    claimed: number
    sent_email: number
    sent_push: number
    skipped: number
    failed: number
}

const MENTION_BATCH_LIMIT = 200

async function loadPendingMentions(supabase: SupabaseLike, limit: number): Promise<PendingMentionRow[]> {
    const res = await supabase
        .from('notification_log')
        .select<PendingMentionRow>('id, user_id, event_type, payload')
        .eq('event_type', 'mention_pending')
        .limit(limit)
    if (res.error) throw new Error(res.error.message)
    return (res.data ?? []) as PendingMentionRow[]
}

/**
 * Atomic state transition. Returns `true` iff THIS caller won the race
 * (at least one row returned). Any concurrent caller gets `false` and skips.
 */
async function transitionRow(
    supabase: SupabaseLike,
    id: string,
    fromState: string,
    toState: string,
    extra?: { provider_id?: string | null; error?: string | null },
): Promise<boolean> {
    const patch: Record<string, unknown> = { event_type: toState, sent_at: new Date().toISOString() }
    if (extra?.provider_id !== undefined) patch.provider_id = extra.provider_id
    if (extra?.error !== undefined) patch.error = extra.error

    const res = await supabase
        .from('notification_log')
        .update<{ id: string }>(patch)
        .eq('id', id)
        .eq('event_type', fromState)
        .select()
    if (res.error) throw new Error(res.error.message)
    return (res.data ?? []).length > 0
}

async function loadRecipients(
    supabase: SupabaseLike,
    userIds: string[],
): Promise<{ prefsByUser: Map<string, MentionPrefsLite>; usersById: Map<string, AuthUserLite> }> {
    const prefsRes = await supabase
        .from('notification_preferences')
        .select<MentionPrefsLite>('user_id, email_mentions, push_mentions, push_overdue, push_assignment, quiet_hours_start, quiet_hours_end, timezone')
        .in('user_id', userIds)
    if (prefsRes.error) throw new Error(prefsRes.error.message)

    // `users_public` is a project-specific view that exposes `auth.users.id +
    // email` to service-role callers. If it doesn't exist in your environment,
    // push-only delivery still works; email branches log `no_email_address`.
    const usersRes = await supabase
        .from('users_public')
        .select<AuthUserLite>('id, email')
        .in('id', userIds)

    const usersById = new Map<string, AuthUserLite>()
    if (!usersRes.error) {
        for (const u of (usersRes.data ?? []) as AuthUserLite[]) usersById.set(u.id, u)
    }

    const prefsByUser = new Map<string, MentionPrefsLite>()
    for (const p of (prefsRes.data ?? []) as MentionPrefsLite[]) prefsByUser.set(p.user_id, p)
    return { prefsByUser, usersById }
}

/**
 * Main dispatcher. Walks every `mention_pending` row, claims it, delivers
 * email + push as each recipient's prefs allow, and transitions the row to
 * the terminal state.
 */
export async function dispatchPendingMentions(
    supabase: SupabaseLike,
    now: Date,
    sendEmail: EmailSender,
    invokePush: PushInvoker,
): Promise<DispatchSummary> {
    const summary: DispatchSummary = { claimed: 0, sent_email: 0, sent_push: 0, skipped: 0, failed: 0 }

    const pending = await loadPendingMentions(supabase, MENTION_BATCH_LIMIT)
    if (pending.length === 0) return summary

    const userIds = Array.from(new Set(pending.map((r) => r.user_id)))
    const { prefsByUser, usersById } = await loadRecipients(supabase, userIds)

    for (const row of pending) {
        const claimed = await transitionRow(supabase, row.id, 'mention_pending', 'mention_processing')
        if (!claimed) continue
        summary.claimed += 1

        const prefs = prefsByUser.get(row.user_id)
        if (!prefs) {
            await transitionRow(supabase, row.id, 'mention_processing', 'mention_skipped', { error: 'prefs_missing' })
            summary.skipped += 1
            continue
        }

        if (inQuietHours(now, prefs.timezone, prefs.quiet_hours_start, prefs.quiet_hours_end)) {
            await transitionRow(supabase, row.id, 'mention_processing', 'mention_skipped', { error: 'quiet_hours' })
            summary.skipped += 1
            continue
        }

        const wantsEmail = prefs.email_mentions === true
        const wantsPush = prefs.push_mentions === true
        if (!wantsEmail && !wantsPush) {
            await transitionRow(supabase, row.id, 'mention_processing', 'mention_skipped', { error: 'pref_disabled' })
            summary.skipped += 1
            continue
        }

        const preview = row.payload?.body_preview ?? ''
        const title = 'New mention on PlanterPlan'
        const body = preview || 'Someone mentioned you in a comment.'
        const projectId = row.payload?.project_id ?? row.payload?.root_id ?? row.payload?.task_id
        const url = projectId ? `/project/${projectId}` : '/'

        let emailSucceeded: boolean | null = null
        let pushSucceeded: boolean | null = null
        let providerId: string | null = null
        const failures: string[] = []

        if (wantsEmail) {
            const user = usersById.get(row.user_id)
            if (!user?.email) {
                emailSucceeded = false
                failures.push('no_email_address')
            } else {
                const html = `<p>${escapeHtml(body)}</p>`
                const text = body
                const emailResult = await sendEmail(user.email, title, html, text)
                emailSucceeded = emailResult.ok
                if (emailResult.ok) {
                    summary.sent_email += 1
                    if (emailResult.id) providerId = emailResult.id
                } else {
                    failures.push(`email:${emailResult.error ?? 'failed'}`)
                }
            }
        }

        if (wantsPush) {
            const pushResult = await invokePush({
                user_ids: [row.user_id],
                title,
                body,
                url,
                tag: `mention:${row.payload?.comment_id ?? row.id}`,
                event_type: 'mentions',
            })
            pushSucceeded = pushResult.ok && (pushResult.sent ?? 0) > 0
            if (pushSucceeded) summary.sent_push += pushResult.sent ?? 1
            else failures.push(`push:${pushResult.error ?? 'failed'}`)
        }

        const anySuccess = emailSucceeded === true || pushSucceeded === true
        if (anySuccess) {
            await transitionRow(supabase, row.id, 'mention_processing', 'mention_sent', {
                provider_id: providerId,
                error: failures.length > 0 ? failures.join(';') : null,
            })
        } else {
            await transitionRow(supabase, row.id, 'mention_processing', 'mention_failed', {
                error: failures.join(';') || 'no_transport',
            })
            summary.failed += 1
        }
    }

    return summary
}

/** Keep the dispatcher self-contained — don't require `_shared/email.ts` imports in vitest. */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
