-- Post-megabatch: commit the users_public view used by dispatch-notifications
--
-- The Wave 30 `dispatch-notifications` edge function queries
-- `public.users_public` to resolve recipient uuids → emails, but the view
-- has never been committed to `docs/db/migrations/`. The function's README
-- asks operators to "add this one-liner manually." The dispatcher's
-- `loadRecipients` silently swallows the missing-relation error and
-- degrades to push-only when the view is absent — a silent correctness
-- regression for any freshly-provisioned environment.
--
-- Commit the view with service-role-only SELECT.

CREATE OR REPLACE VIEW public.users_public AS
SELECT
    u.id,
    u.email::text AS email
FROM auth.users u;

-- SECURITY INVOKER so queries run as the caller's role; combined with the
-- explicit REVOKE below this means only service_role can SELECT.
ALTER VIEW public.users_public SET (security_invoker = true);

REVOKE ALL ON public.users_public FROM PUBLIC, authenticated, anon;
GRANT SELECT ON public.users_public TO service_role;

COMMENT ON VIEW public.users_public IS
    'Wave 30 follow-up (post-megabatch hardening) — restricted projection of '
    'auth.users for edge-function consumers (dispatch-notifications). '
    'Service-role SELECT only; never callable from the client bundle.';
