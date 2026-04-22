-- Wave 35 Task 1 — ICS calendar feed tokens
--
-- Per-user opaque tokens that back the public `/functions/v1/ics-feed` edge
-- function. Each token is the full credential for its feed (there is no
-- secondary auth on the fetch — the token IS the auth). Rotation via
-- revoked_at; never hard-deleted so audit trails stay intact.

CREATE TABLE IF NOT EXISTS public.ics_feed_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token text NOT NULL UNIQUE,
    label text,
    project_filter uuid[],
    created_at timestamptz NOT NULL DEFAULT now(),
    revoked_at timestamptz,
    last_accessed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ics_feed_tokens_token ON public.ics_feed_tokens (token);
CREATE INDEX IF NOT EXISTS idx_ics_feed_tokens_user ON public.ics_feed_tokens (user_id);

ALTER TABLE public.ics_feed_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own ICS tokens" ON public.ics_feed_tokens;
CREATE POLICY "Users can view their own ICS tokens"
    ON public.ics_feed_tokens
    FOR SELECT
    USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can create their own ICS tokens" ON public.ics_feed_tokens;
CREATE POLICY "Users can create their own ICS tokens"
    ON public.ics_feed_tokens
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own ICS tokens" ON public.ics_feed_tokens;
CREATE POLICY "Users can update their own ICS tokens"
    ON public.ics_feed_tokens
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete their own ICS tokens" ON public.ics_feed_tokens;
CREATE POLICY "Users can delete their own ICS tokens"
    ON public.ics_feed_tokens
    FOR DELETE
    USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

COMMENT ON TABLE public.ics_feed_tokens IS
    'Wave 35 — per-user ICS calendar feed tokens. The token value IS the credential used by the public /functions/v1/ics-feed edge function. Revocation is soft (revoked_at) so past accesses stay auditable via last_accessed_at.';
