-- Admin moderation — toggle a user's platform-admin flag.
--
-- Wave follow-up: surfaces a "Toggle admin role" action in the AdminUsers
-- detail aside. Auth: gated by `public.is_admin(auth.uid())` — only an
-- existing admin can grant or revoke admin access. The three-tier safety
-- matrix:
--   1. RLS on `admin_users` already requires service_role to mutate.
--   2. This RPC is SECURITY DEFINER (runs as postgres) so the INSERT /
--      DELETE succeeds even though the caller has no direct write on
--      `admin_users`.
--   3. The first line of the function body re-checks the CALLER is an
--      admin — caller has to already be in `admin_users` to call this.
--
-- Self-demotion guard: an admin cannot revoke their OWN admin flag via
-- this RPC. Two-admin deadlock protection (you could accidentally remove
-- yourself as the sole admin and lock the org out). Removing yourself
-- still works via the `admin_users` table directly (service_role /
-- migration).
--
-- Idempotency: calling `make_admin := TRUE` on an already-admin is a no-op
-- (INSERT ... ON CONFLICT DO NOTHING). Calling `make_admin := FALSE` on a
-- standard user is also a no-op (DELETE of a non-existent row).

CREATE OR REPLACE FUNCTION public.admin_set_user_admin_role(
    p_target_uid uuid,
    p_make_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_target_email text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'unauthorized: not authenticated';
    END IF;

    IF NOT public.is_admin(v_caller) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF v_caller = p_target_uid AND p_make_admin = FALSE THEN
        RAISE EXCEPTION 'self_demotion_forbidden: remove your own admin flag via service_role';
    END IF;

    -- Look up the target's email from auth.users — admin_users stores it
    -- denormalized so the whitelist is readable without a users join.
    SELECT u.email INTO v_target_email
    FROM auth.users u
    WHERE u.id = p_target_uid;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'target_not_found: no auth.users row with id %', p_target_uid;
    END IF;

    IF p_make_admin THEN
        INSERT INTO public.admin_users (user_id, email)
        VALUES (p_target_uid, v_target_email)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        DELETE FROM public.admin_users
        WHERE user_id = p_target_uid;
    END IF;

    -- Activity-log the change so it surfaces in `admin_recent_activity`.
    INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
    VALUES (
        NULL,
        v_caller,
        'member',
        p_target_uid::text,
        CASE WHEN p_make_admin THEN 'admin_granted' ELSE 'admin_revoked' END,
        jsonb_build_object('target_email', v_target_email)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_admin_role(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_admin_role(uuid, boolean) TO authenticated;

COMMENT ON FUNCTION public.admin_set_user_admin_role(uuid, boolean) IS
'Grants or revokes platform-admin status for a user. Gated by is_admin(auth.uid()); self-demotion forbidden; idempotent; writes an activity_log entry on success.';
