// Shared email dispatch + rendering helpers for Supabase Edge Functions.
//
// Wave 22: wires real dispatch through Resend for the supervisor-report
// function. `sendEmail` sanitizes upstream errors before returning (mirrors
// the pattern in `supervisor-report/index.ts:193-201`). Rendering is kept
// pure so it can be unit-tested without hitting the network.

export interface MilestoneSummary {
    id: string
    title: string | null
    due_date: string | null
    status: string | null
    is_complete: boolean | null
    updated_at: string | null
    notes: string | null
}

export interface ProjectReportPayload {
    project_id: string
    project_title: string | null
    supervisor_email: string
    month: string
    completed_this_month: MilestoneSummary[]
    overdue: MilestoneSummary[]
    upcoming_this_month: MilestoneSummary[]
}

export interface SendEmailInput {
    to: string
    subject: string
    html: string
    text: string
}

export interface SendEmailResult {
    ok: boolean
    id?: string
    error?: string
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/**
 * POST a single transactional email via Resend. The return value never
 * contains raw upstream response bodies — the caller gets a boolean plus a
 * sanitized error string. Full response details are logged server-side.
 * @param input - Email envelope: `to`, `subject`, `html`, `text`.
 * @returns Sanitized `{ ok, id?, error? }` — `ok: false` when the Resend env
 *   vars are missing, the POST returns non-2xx, or the network throws.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY')
    const fromAddress = Deno.env.get('RESEND_FROM_ADDRESS')

    if (!apiKey || !fromAddress) {
        console.error('[email] missing EMAIL_PROVIDER_API_KEY or RESEND_FROM_ADDRESS')
        return { ok: false, error: 'Email provider not configured' }
    }

    try {
        const res = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: input.to,
                subject: input.subject,
                html: input.html,
                text: input.text,
            }),
        })

        if (!res.ok) {
            // Consume the body for logging, but never return it to the caller.
            const raw = await res.text().catch(() => '<unreadable>')
            console.error('[email] dispatch failed', res.status, raw)
            return { ok: false, error: 'Email dispatch failed' }
        }

        const data = (await res.json().catch(() => ({}))) as { id?: string }
        return { ok: true, id: data.id }
    } catch (error) {
        console.error('[email] network error', error)
        return { ok: false, error: 'Email dispatch failed' }
    }
}

// ----------------------------------------------------------------------------
// Pure rendering (unit-testable)
// ----------------------------------------------------------------------------

/**
 * Escape the five HTML-significant characters (`&`, `<`, `>`, `"`, `'`) so
 * arbitrary user-supplied strings can safely be interpolated into the HTML
 * body without opening an XSS vector.
 * @param value - Raw string to escape.
 * @returns The escaped string.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function displayTitle(m: MilestoneSummary): string {
    return m.title?.trim() || 'Untitled milestone'
}

function renderTextSection(heading: string, milestones: MilestoneSummary[]): string {
    if (milestones.length === 0) return `${heading}: none`
    const lines = milestones.map((m) => {
        const due = m.due_date ? ` (due ${m.due_date})` : ''
        const notes = m.notes?.trim() ? `\n    Notes: ${m.notes.trim()}` : ''
        return `  - ${displayTitle(m)}${due}${notes}`
    })
    return `${heading} (${milestones.length}):\n${lines.join('\n')}`
}

function renderHtmlSection(heading: string, milestones: MilestoneSummary[]): string {
    if (milestones.length === 0) {
        return `<h3>${escapeHtml(heading)}</h3><p><em>None</em></p>`
    }
    const items = milestones
        .map((m) => {
            const due = m.due_date ? ` <span style="color:#64748b">(due ${escapeHtml(m.due_date)})</span>` : ''
            const notes = m.notes?.trim()
                ? `<div style="margin-top:4px;color:#475569"><strong>Notes:</strong> ${escapeHtml(m.notes.trim())}</div>`
                : ''
            return `<li>${escapeHtml(displayTitle(m))}${due}${notes}</li>`
        })
        .join('')
    return `<h3>${escapeHtml(heading)} (${milestones.length})</h3><ul>${items}</ul>`
}

export interface RenderedEmail {
    subject: string
    html: string
    text: string
}

// ----------------------------------------------------------------------------
// Wave 30 — Overdue digest (daily / weekly)
// ----------------------------------------------------------------------------

export interface OverdueTaskSummary {
    id: string
    title: string | null
    due_date: string | null
    project_title: string | null
}

export interface OverdueDigestPayload {
    recipient_email: string
    cadence: 'daily' | 'weekly'
    tasks: OverdueTaskSummary[]
}

function renderDigestTaskLineText(t: OverdueTaskSummary): string {
    const title = t.title?.trim() || 'Untitled task'
    const project = t.project_title?.trim() || 'Untitled project'
    const due = t.due_date ? ` (due ${t.due_date})` : ''
    return `  - ${title} — ${project}${due}`
}

function renderDigestTaskLineHtml(t: OverdueTaskSummary): string {
    const title = escapeHtml(t.title?.trim() || 'Untitled task')
    const project = escapeHtml(t.project_title?.trim() || 'Untitled project')
    const due = t.due_date
        ? ` <span style="color:#64748b">(due ${escapeHtml(t.due_date)})</span>`
        : ''
    return `<li><strong>${title}</strong> — ${project}${due}</li>`
}

/**
 * Build the subject + HTML + plain-text body for the overdue-digest email
 * dispatched by `supabase/functions/overdue-digest/`. Pure: same input
 * always produces the same output. The caller (the edge function) decides
 * cadence and tz-filtering BEFORE invoking this — the renderer never sees
 * a zero-task payload.
 *
 * Callers SHOULD skip the dispatch entirely when `tasks.length === 0`; this
 * renderer tolerates the empty case for safety but produces a "nothing to
 * report" body that isn't meant for user delivery.
 */
export function renderOverdueDigestEmail(payload: OverdueDigestPayload): RenderedEmail {
    const n = payload.tasks.length
    const subject = `PlanterPlan — ${n} overdue task${n === 1 ? '' : 's'}`

    if (n === 0) {
        const text = 'No overdue tasks to report.'
        const html = '<p>No overdue tasks to report.</p>'
        return { subject, html, text }
    }

    const cadenceLabel = payload.cadence === 'weekly' ? 'weekly' : 'daily'
    const intro = `Your ${cadenceLabel} overdue task digest — ${n} task${n === 1 ? '' : 's'} past due.`

    const text = [
        intro,
        '',
        ...payload.tasks.map(renderDigestTaskLineText),
    ].join('\n')

    const html = [
        `<p>${escapeHtml(intro)}</p>`,
        `<ul>${payload.tasks.map(renderDigestTaskLineHtml).join('')}</ul>`,
    ].join('')

    return { subject, html, text }
}

/**
 * Build the subject + HTML + plain-text body for a supervisor monthly
 * report. Pure: same input always produces the same output. Keep the payload
 * shape in sync with `src/features/projects/hooks/useProjectReports.ts` and
 * with `supervisor-report/index.ts:buildProjectPayload`.
 * @param payload - Per-project report payload (milestone arrays + month key).
 * @returns `{ subject, html, text }` ready to pass to `sendEmail`.
 */
export function renderSupervisorReportEmail(payload: ProjectReportPayload): RenderedEmail {
    const projectName = payload.project_title?.trim() || 'Untitled project'
    const subject = `Project Status Report — ${projectName} — ${payload.month}`

    const { completed_this_month, overdue, upcoming_this_month } = payload
    const hasAny =
        completed_this_month.length + overdue.length + upcoming_this_month.length > 0

    const intro = hasAny
        ? `Here is the monthly project status report for ${projectName} (${payload.month}).`
        : `No milestone activity to report for ${projectName} this month (${payload.month}).`

    const text = [
        intro,
        '',
        renderTextSection('Completed this month', completed_this_month),
        '',
        renderTextSection('Overdue', overdue),
        '',
        renderTextSection('Upcoming this month', upcoming_this_month),
    ].join('\n')

    const html = [
        `<p>${escapeHtml(intro)}</p>`,
        renderHtmlSection('Completed this month', completed_this_month),
        renderHtmlSection('Overdue', overdue),
        renderHtmlSection('Upcoming this month', upcoming_this_month),
    ].join('')

    return { subject, html, text }
}
