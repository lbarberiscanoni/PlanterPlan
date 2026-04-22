import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderOverdueDigestEmail, sendEmail } from '../_shared/email.ts'
import { corsHeaders, requireServiceRole } from '../_shared/auth.ts'
import { dispatchOverdueDigest, type DigestEmailSender } from './dispatch.ts'

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    // Security: cron-only. Reject non-service-role callers to prevent
    // arbitrary authenticated users from triggering mass-email fan-out
    // under the app's RESEND_FROM_ADDRESS.
    const authFail = requireServiceRole(req)
    if (authFail) return authFail

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        )

        const emailSender: DigestEmailSender = async (to, subject, html, text) => {
            const result = await sendEmail({ to, subject, html, text })
            return { ok: result.ok, id: result.id, error: result.error }
        }

        // @ts-expect-error the Deno Supabase client has a slightly wider type than the pure helper expects; the runtime contract is identical.
        const summary = await dispatchOverdueDigest(supabase, new Date(), renderOverdueDigestEmail, emailSender)

        return new Response(JSON.stringify({ success: true, ...summary }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    } catch (error) {
        console.error('[overdue-digest] unhandled error', error)
        return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
