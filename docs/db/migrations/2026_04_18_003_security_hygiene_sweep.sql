-- Post-megabatch security hygiene sweep
--
-- Consolidates a set of small, independently-reviewed policy + function
-- hardenings surfaced by the repo-wide security + DB/ops audits. Every
-- statement is additive or idempotent; the migration is re-runnable against
-- a database that has already applied a subset.

-- ===========================================================================
-- SEC-4 / DB-10: revoke PUBLIC on sensitive SECURITY DEFINER helpers
-- ===========================================================================
-- Postgres grants EXECUTE to PUBLIC on SECURITY DEFINER functions at creation
-- time unless explicitly revoked. Both of these helpers read `auth.users` and
-- leak enumeration signals if any authenticated user can invoke them.

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
-- service_role grant is preserved so the invite-by-email edge function
-- (which runs as service_role) can still resolve email → uid.
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

-- `debug_create_project(text, uuid)` returns is_admin(uid) for arbitrary
-- uuids. It is a dev-only reconnaissance primitive that shipped with the
-- schema. Drop it. (Verified via `grep -r debug_create_project src/` before
-- the drop — no call sites.)
DROP FUNCTION IF EXISTS public.debug_create_project(text, uuid);

-- ===========================================================================
-- SEC-5: close template-INSERT policy gap on public.tasks
-- ===========================================================================
-- Two INSERT policies exist on `public.tasks`:
--   - "Allow project creation" — allows any authenticated user to insert a
--     root task (`root_id IS NULL`, `parent_task_id IS NULL`, `creator = auth.uid()`)
--     with NO `origin` check.
--   - "Enable insert for authenticated users within project" — correctly
--     blocks `origin = 'template'` unless the caller is admin.
--
-- Multi-policy INSERT OR-combines WITH CHECK, so the first policy lets any
-- authenticated user create a template row. Combined with the public SELECT
-- policy on templates, attacker-created templates become visible across the
-- entire tenant.
--
-- Drop the looser policy and replace it with a stricter variant that
-- preserves the "every user can create their own project" capability while
-- blocking the template gap.

DROP POLICY IF EXISTS "Allow project creation" ON public.tasks;

-- `(SELECT auth.uid())` is the idiomatic Supabase form: `auth.uid()` is
-- equivalent to `(auth.jwt() ->> 'sub')::uuid` but more readable, and the
-- wrapping SELECT is the documented InitPlan cache so the value is computed
-- once per query instead of per row.
CREATE POLICY "Allow project creation" ON public.tasks
    FOR INSERT TO authenticated
    WITH CHECK (
        (root_id IS NULL OR root_id = id)
        AND parent_task_id IS NULL
        AND creator = (SELECT auth.uid())
        AND (
            origin IS DISTINCT FROM 'template'
            OR public.is_admin((SELECT auth.uid()))
        )
    );

-- ===========================================================================
-- SEC-6: scope resolve_user_handles + cap input length
-- ===========================================================================
-- The public.resolve_user_handles(text[]) RPC lets any authenticated user
-- query `auth.users` by email prefix or username. No length cap and no
-- "share a project" filter → the entire user directory is enumerable.
-- Patch to: (a) reject arrays > 20 handles, (b) reject handles < 3 chars,
-- (c) only return matches for users the caller already shares a project
-- with. Preserves the Wave 30 mention-resolution contract for real users;
-- blocks dictionary enumeration.

CREATE OR REPLACE FUNCTION public.resolve_user_handles(p_handles text[])
RETURNS TABLE (handle text, user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_filtered text[];
BEGIN
    IF v_caller IS NULL THEN
        RETURN;
    END IF;

    IF p_handles IS NULL OR array_length(p_handles, 1) IS NULL THEN
        RETURN;
    END IF;

    IF array_length(p_handles, 1) > 20 THEN
        RAISE EXCEPTION 'resolve_user_handles: too many handles (max 20)';
    END IF;

    -- Keep only handles at least 3 characters long (stops single-letter
    -- enumeration). Case-insensitive comparison.
    SELECT array_agg(h) INTO v_filtered
    FROM unnest(p_handles) AS h
    WHERE char_length(trim(h)) >= 3;

    IF v_filtered IS NULL OR array_length(v_filtered, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT h, u.id
    FROM unnest(v_filtered) AS h
    JOIN auth.users u
        ON lower(u.email) LIKE lower(h) || '@%'
        OR lower(u.raw_user_meta_data ->> 'username') = lower(h)
    -- Caller must share a project with the resolved user (or be admin).
    WHERE EXISTS (
        SELECT 1
        FROM public.project_members pm1
        JOIN public.project_members pm2 ON pm1.project_id = pm2.project_id
        WHERE pm1.user_id = v_caller AND pm2.user_id = u.id
    ) OR public.is_admin(v_caller);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_handles(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_user_handles(text[]) TO authenticated;

-- ===========================================================================
-- SEC-8: security_invoker=true on public views + REVOKE anon
-- ===========================================================================
-- In Postgres ≥15, views default to security_invoker=false — they run as the
-- OWNER (usually postgres), which bypasses RLS on the underlying tables. The
-- two views below select from `public.tasks` (RLS-protected) and are granted
-- SELECT to `anon`. If Supabase's runtime doesn't override the default, an
-- anonymous hitter of these views sees every row cross-tenant. Flip to
-- security_invoker=true (the RLS-respecting mode) and revoke anon access.

ALTER VIEW public.tasks_with_primary_resource SET (security_invoker = true);
ALTER VIEW public.view_master_library SET (security_invoker = true);

REVOKE SELECT ON public.tasks_with_primary_resource FROM anon;
REVOKE SELECT ON public.view_master_library FROM anon;

-- ===========================================================================
-- DB-7: document admin_users SECURITY-DEFINER-only access contract
-- ===========================================================================
-- admin_users has RLS enabled with ZERO policies, which means no role can
-- SELECT/INSERT/UPDATE/DELETE directly. Access happens exclusively through
-- SECURITY DEFINER helpers (`public.is_admin`, `public.admin_*` RPCs).
-- Add a table comment so future readers don't mistake the missing policies
-- for an oversight.

COMMENT ON TABLE public.admin_users IS
    'SECURITY DEFINER-only access. RLS is intentionally enabled with zero policies — '
    'reads happen via public.is_admin(uid) and the public.admin_* SECURITY DEFINER '
    'RPCs. Direct SELECT/INSERT/UPDATE/DELETE by authenticated or anon roles is '
    'denied by design.';

-- ===========================================================================
-- DB-8: add WITH CHECK to Notif prefs UPDATE policy
-- ===========================================================================
-- Without WITH CHECK, an authenticated user can UPDATE their row and set
-- `user_id` to a different uuid in one statement. PK collision blocks most
-- cases, but a post-delete window lets the hijack succeed.

DROP POLICY IF EXISTS "Notif prefs: update own" ON public.notification_preferences;
CREATE POLICY "Notif prefs: update own" ON public.notification_preferences
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ===========================================================================
-- DB-9: drop Wave 23 "Enable all for authenticated users" policy on project_members
-- ===========================================================================
-- Wave 24's rewrite (2026_04_18_rewrite_project_members_policies.sql) added
-- four precise per-op policies but did NOT drop the Wave-23 wildcard policy.
-- Policies OR-combine, so the wildcard grants broader access than the rewrite
-- intended. Drop it.

DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.project_members;

-- ===========================================================================
-- DB-12: SET search_path TO '' on three SECURITY INVOKER trigger functions
-- ===========================================================================
-- Defense-in-depth. Not exploitable today under the SECURITY INVOKER model
-- with Supabase's controlled search_path, but the inconsistency is a trap:
-- if any of these are later promoted to SECURITY DEFINER, an unqualified
-- `public.tasks` reference becomes a search-path-injection vector.

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_root_id_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_parent_root uuid;
BEGIN
    IF NEW.parent_task_id IS NULL THEN
        NEW.root_id := NEW.id;
    ELSE
        SELECT root_id INTO v_parent_root FROM public.tasks WHERE id = NEW.parent_task_id;
        IF v_parent_root IS NULL THEN
            -- Parent might itself be a root whose row is being inserted
            -- in the same statement; fall back to the parent's id.
            SELECT id INTO v_parent_root FROM public.tasks WHERE id = NEW.parent_task_id;
        END IF;
        NEW.root_id := COALESCE(v_parent_root, NEW.parent_task_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_completion_flags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    -- Wave 23 invariant: status is the source of truth.
    -- is_complete is derived to match.
    IF NEW.status = 'completed' THEN
        NEW.is_complete := true;
    ELSE
        NEW.is_complete := false;
    END IF;
    RETURN NEW;
END;
$$;

-- ===========================================================================
-- DB-17: realign has_permission('owner') to check_project_ownership_by_role
-- ===========================================================================
-- The 'owner' branch of has_permission currently treats the task's `creator`
-- column as an ownership signal, which is exactly the conflation Wave 23/24
-- audited out of the project_members policies. Only project_members.role =
-- 'owner' should count as ownership.

CREATE OR REPLACE FUNCTION public.has_permission(
    p_project_id uuid,
    p_user_id uuid,
    p_required_role text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_role text;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN false;
    END IF;

    IF public.is_admin(p_user_id) THEN
        RETURN true;
    END IF;

    IF p_required_role = 'owner' THEN
        RETURN public.check_project_ownership_by_role(p_project_id, p_user_id);
    END IF;

    -- 'member' branch: any role in project_members counts.
    SELECT role INTO v_role
    FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id;

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    IF p_required_role = 'member' THEN
        RETURN true;
    END IF;

    -- 'editor' / 'coach' / 'viewer' etc. — require exact role or higher.
    RETURN v_role = p_required_role OR v_role = 'owner';
END;
$$;
