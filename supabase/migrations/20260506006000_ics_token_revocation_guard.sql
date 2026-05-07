-- PR 6: ICS token revocation hardening.
--
-- Users may create opaque feed tokens and revoke their own active tokens.
-- They may not mutate token credentials, retarget a feed, clear revoked_at,
-- or hard-delete rows and erase last_accessed_at audit history. Service-role
-- maintenance remains explicit for the public edge feed's access stamping.

CREATE OR REPLACE FUNCTION public.enforce_ics_feed_token_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF OLD.user_id IS DISTINCT FROM NEW.user_id
        OR OLD.token IS DISTINCT FROM NEW.token
        OR OLD.label IS DISTINCT FROM NEW.label
        OR OLD.project_filter IS DISTINCT FROM NEW.project_filter
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.last_accessed_at IS DISTINCT FROM NEW.last_accessed_at
    THEN
        RAISE EXCEPTION 'ICS feed token rows are immutable except user revocation'
            USING ERRCODE = 'P0001';
    END IF;

    IF OLD.revoked_at IS NOT NULL THEN
        IF NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
            RAISE EXCEPTION 'revoked ICS feed tokens cannot be reactivated or changed'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.revoked_at IS NULL THEN
        RAISE EXCEPTION 'ICS feed token update must revoke the token'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_ics_feed_token_update_scope() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_ics_feed_token_update_scope() IS
    'Restricts authenticated users to one-way ICS token revocation; service-role maintenance may stamp last_accessed_at.';

DROP TRIGGER IF EXISTS "trg_enforce_ics_feed_token_update_scope" ON public.ics_feed_tokens;
CREATE TRIGGER "trg_enforce_ics_feed_token_update_scope"
BEFORE UPDATE ON public.ics_feed_tokens
FOR EACH ROW
EXECUTE FUNCTION public.enforce_ics_feed_token_update_scope();

DROP POLICY IF EXISTS "Users can delete their own ICS tokens" ON public.ics_feed_tokens;
DROP POLICY IF EXISTS "Admins can delete ICS tokens" ON public.ics_feed_tokens;
CREATE POLICY "Admins can delete ICS tokens"
    ON public.ics_feed_tokens
    FOR DELETE
    TO authenticated
    USING (public.is_admin((SELECT auth.uid())));

COMMENT ON POLICY "Admins can delete ICS tokens" ON public.ics_feed_tokens IS
    'User-facing token lifecycle is soft revocation; only admins/service-role may hard-delete rows when required for operations.';
