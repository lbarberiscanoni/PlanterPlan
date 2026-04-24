import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendEmail } from '../_shared/email.ts'
import { corsHeaders, requireServiceRole } from '../_shared/auth.ts'
import {
    dispatchPendingMentions,
    type EmailSender,
    type PushInvoker,
} from './dispatch.ts'

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // Security: dispatcher callable only by service role (scheduler or other
    // edge functions with the service key). Without this, any authenticated
    // user could trigger mention dispatch and spam the notification pipeline.
    const authFail = requireServiceRole(req)
    if (authFail) return authFail

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        const emailSender: EmailSender = async (to, subject, html, text) => {
            const result = await sendEmail({ to, subject, html, text })
            return { ok: result.ok, id: result.id, error: result.error }
        }

        const pushInvoker: PushInvoker = async (input) => {
            // Invoke the sibling dispatch-push function via its public URL with
            // the service-role bearer. We use a direct fetch rather than the
            // Supabase client's `.functions.invoke` because cross-function
            // dispatch from inside a Deno edge function doesn't always have a
            // user-scoped JWT available.
            const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/dispatch-push`
            const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${serviceKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(input),
                })
                if (!res.ok) {
                    const raw = await res.text().catch(() => '<unreadable>')
                    console.error('[dispatch-notifications] push invoke failed', res.status, raw)
                    return { ok: false, error: `push_${res.status}` }
                }
                const body = await res.json().catch(() => null) as {
                    success?: boolean
                    sent?: number
                    skipped?: number
                    failed?: number
                    error?: string
                } | null
                const sent = typeof body?.sent === 'number' ? body.sent : 0
                const skipped = typeof body?.skipped === 'number' ? body.skipped : 0
                const failed = typeof body?.failed === 'number' ? body.failed : 0
                if (body?.success !== true || sent <= 0) {
                    return {
                        ok: false,
                        sent,
                        skipped,
                        failed,
                        error: body?.error ?? (failed > 0 ? 'push_failed' : 'push_not_delivered'),
                    }
                }
                return { ok: true, sent, skipped, failed }
            } catch (err) {
                console.error('[dispatch-notifications] push invoke error', err)
                return { ok: false, error: 'push_network_error' }
            }
        }

        // @ts-expect-error the Deno Supabase client has a slightly wider type than the pure helper expects; the runtime contract is identical.
        const summary = await dispatchPendingMentions(supabase, new Date(), emailSender, pushInvoker)

        return new Response(JSON.stringify({ success: true, ...summary }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[dispatch-notifications] unhandled error', error)
        return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
