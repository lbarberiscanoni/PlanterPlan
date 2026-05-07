import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
    handleAdminUserModerationRequest,
    type AdminModerationCreateClient,
} from './handler.ts';

/**
 * Admin-only moderation endpoint. Shared home for destructive actions that
 * require Supabase's admin API rather than a SECURITY DEFINER SQL RPC:
 *
 *   - action: 'suspend' - bans the target for `duration_hours`, or an
 *     effectively indefinite duration when omitted.
 *   - action: 'unsuspend' - clears the ban.
 *   - action: 'reset_password' - generates a password-recovery link that the
 *     admin shares out-of-band.
 *
 * The implementation lives in `handler.ts` so authorization and action flows
 * are covered by Vitest without importing Deno's `serve` runtime.
 */
serve((req) =>
    handleAdminUserModerationRequest(req, {
        getEnv: (key) => Deno.env.get(key),
        createClient: createClient as AdminModerationCreateClient,
        logger: console,
    }),
);
