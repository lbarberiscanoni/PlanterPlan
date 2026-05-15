-- Role hierarchy collapse: 5 per-project roles + carve-outs -> 2 roles.
--
-- Before: project_members.role IN ('owner','editor','coach','viewer','limited')
-- with a separate global admin_users table, plus a coach trigger restricting
-- column writes on Coaching tasks and a viewer/limited Phase Lead carve-out
-- that walked the parent chain.
--
-- After: project_members.role IN ('planter','team').
--   * Admin (global, admin_users) is unchanged and continues to bypass all
--     project gates.
--   * Planter (per project) merges owner + editor authority: full task CRUD,
--     can invite + manage members.
--   * Team (per project) replaces coach/viewer/limited: full task CRUD on
--     instance projects, cannot invite or manage members. Template writes
--     remain admin-only.
--
-- Migration mapping:
--   owner, editor             -> planter
--   coach, viewer, limited    -> team
--
-- The coach trigger, the Phase Lead helper + policy + trigger, and the
-- coaching-assignee triggers are all dropped. settings.is_coaching_task and
-- settings.phase_lead_user_ids become inert JSON values.

--------------------------------------------------------------------------------
-- 1. Drop policies + triggers + functions that hard-code the old roles before
--    we touch the CHECK constraints. Dropping in this order avoids "policy
--    depends on function" errors.
--------------------------------------------------------------------------------

-- Coach + Phase Lead UPDATE policies on tasks.
DROP POLICY IF EXISTS "Enable update for coaches on coaching tasks" ON public.tasks;
DROP POLICY IF EXISTS "Enable update for phase leads" ON public.tasks;

-- Coach + Phase Lead column-scope triggers on tasks.
DROP TRIGGER IF EXISTS trg_enforce_coach_task_update_scope ON public.tasks;
DROP TRIGGER IF EXISTS trg_enforce_phase_lead_task_update_scope ON public.tasks;

-- Coaching-assignee auto-fill triggers (depend on role = 'coach').
DROP TRIGGER IF EXISTS trg_set_coaching_assignee ON public.tasks;
DROP TRIGGER IF EXISTS trg_backfill_coaching_assignees ON public.project_members;

DROP FUNCTION IF EXISTS public.enforce_coach_task_update_scope();
DROP FUNCTION IF EXISTS public.enforce_phase_lead_task_update_scope();
DROP FUNCTION IF EXISTS public.user_is_phase_lead(uuid, uuid);
DROP FUNCTION IF EXISTS public.set_coaching_assignee();
DROP FUNCTION IF EXISTS public.backfill_coaching_assignees();

-- Drop policies that hard-code role arrays so we can recreate them against
-- the new role vocabulary. Listed in lexical order per table for review.
DROP POLICY IF EXISTS "Allow project creation" ON public.tasks;
DROP POLICY IF EXISTS "Allow subtask creation by members" ON public.tasks;
DROP POLICY IF EXISTS "Enable delete for users" ON public.tasks;
DROP POLICY IF EXISTS "Enable insert for authenticated users within project" ON public.tasks;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tasks;
DROP POLICY IF EXISTS "Enable update for users" ON public.tasks;

DROP POLICY IF EXISTS "Manage people for owners and editors" ON public.people;
DROP POLICY IF EXISTS "View people for project members" ON public.people;

DROP POLICY IF EXISTS "Manage relationships" ON public.task_relationships;
DROP POLICY IF EXISTS "View relationships" ON public.task_relationships;

DROP POLICY IF EXISTS "Manage resources" ON public.task_resources;
DROP POLICY IF EXISTS "View resources" ON public.task_resources;

DROP POLICY IF EXISTS "View project members" ON public.project_members;
DROP POLICY IF EXISTS "members_update_policy" ON public.project_members;

DROP POLICY IF EXISTS "Create invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "Delete invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "View invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "Create invites for project owners" ON public.project_invites;
DROP POLICY IF EXISTS "Delete invites for project owners" ON public.project_invites;
DROP POLICY IF EXISTS "View invites for project owners" ON public.project_invites;

--------------------------------------------------------------------------------
-- 2. Drop the old CHECK constraints *before* backfilling so the UPDATEs that
--    write the new role values are not rejected by the still-old constraint.
--------------------------------------------------------------------------------

ALTER TABLE public.project_members
    DROP CONSTRAINT IF EXISTS project_members_role_check;
ALTER TABLE public.project_invites
    DROP CONSTRAINT IF EXISTS project_invites_role_check;

--------------------------------------------------------------------------------
-- 3. Backfill data.
--------------------------------------------------------------------------------

UPDATE public.project_members
SET role = 'planter'
WHERE role IN ('owner', 'editor');

UPDATE public.project_members
SET role = 'team'
WHERE role IN ('coach', 'viewer', 'limited');

UPDATE public.project_invites
SET role = 'planter'
WHERE role IN ('owner', 'editor');

UPDATE public.project_invites
SET role = 'team'
WHERE role IN ('coach', 'viewer', 'limited');

--------------------------------------------------------------------------------
-- 4. Install the new CHECK constraints + default for project_members.
--------------------------------------------------------------------------------

ALTER TABLE public.project_members
    ADD CONSTRAINT project_members_role_check
    CHECK (role = ANY (ARRAY['planter'::text, 'team'::text]));

ALTER TABLE public.project_members
    ALTER COLUMN role SET DEFAULT 'team';

ALTER TABLE public.project_invites
    ADD CONSTRAINT project_invites_role_check
    CHECK (role = ANY (ARRAY['planter'::text, 'team'::text]));

--------------------------------------------------------------------------------
-- 5. Helper function rewrites. check_project_ownership_by_role now means
--    "is this user a Planter on this project". The shim check_project_ownership
--    (creatorship) is untouched.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_project_ownership_by_role(p_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.project_members
        WHERE project_id = p_id
          AND user_id    = u_id
          AND role       = 'planter'
    );
END;
$$;

COMMENT ON FUNCTION public.check_project_ownership_by_role(uuid, uuid) IS
    'Returns true when the user is a Planter on the project. Planter is the per-project top role after the 5->2 role collapse.';

-- has_permission previously special-cased owner. Map the 'owner' branch onto
-- 'planter' for backwards compatibility; the 'member' branch is unchanged.
CREATE OR REPLACE FUNCTION public.has_permission(p_project_id uuid, p_user_id uuid, p_required_role text DEFAULT 'member')
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role text;
    v_auth_uid uuid := auth.uid();
BEGIN
    IF p_user_id IS NULL OR v_auth_uid IS NULL OR p_user_id <> v_auth_uid THEN
        RETURN false;
    END IF;

    IF public.is_admin(p_user_id) THEN
        RETURN true;
    END IF;

    IF p_required_role IN ('owner', 'planter') THEN
        RETURN public.check_project_ownership_by_role(p_project_id, p_user_id);
    END IF;

    SELECT role INTO v_role
    FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id;

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    IF p_required_role = 'member' THEN
        RETURN true;
    END IF;

    RETURN v_role = p_required_role OR v_role = 'planter';
END;
$$;

--------------------------------------------------------------------------------
-- 6. Invite RPC. Planters and admins may invite; assignable roles are
--    planter/team only.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.invite_user_to_project(
    p_project_id uuid,
    p_email text,
    p_role text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_invite_id uuid;
    v_token uuid;
    v_inviter_role text;
    v_is_admin boolean;
    v_email text;
BEGIN
    v_email := lower(trim(p_email));
    IF v_email IS NULL OR v_email = '' THEN
        RAISE EXCEPTION 'Invalid email';
    END IF;
    IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
        RAISE EXCEPTION 'Invalid email';
    END IF;

    IF p_role IS NULL OR p_role NOT IN ('planter', 'team') THEN
        RAISE EXCEPTION 'Invalid role';
    END IF;

    v_is_admin := public.is_admin(auth.uid());

    SELECT role INTO v_inviter_role
    FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id    = auth.uid();

    IF NOT v_is_admin AND v_inviter_role IS DISTINCT FROM 'planter' THEN
        RAISE EXCEPTION 'Forbidden: only Planters can invite users.';
    END IF;

    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email;

    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.project_members (project_id, user_id, role)
        VALUES (p_project_id, v_user_id, p_role)
        ON CONFLICT (project_id, user_id) DO UPDATE
            SET role = EXCLUDED.role;

        RETURN jsonb_build_object(
            'status', 'added',
            'user_id', v_user_id
        );
    END IF;

    INSERT INTO public.project_invites (project_id, email, role)
    VALUES (p_project_id, v_email, p_role)
    ON CONFLICT (project_id, email) DO UPDATE
        SET role       = EXCLUDED.role,
            expires_at = (now() + interval '7 days')
    RETURNING id, token INTO v_invite_id, v_token;

    RETURN jsonb_build_object(
        'status', 'invited',
        'invite_id', v_invite_id,
        'token', v_token
    );
END;
$$;

COMMENT ON FUNCTION public.invite_user_to_project(uuid, text, text)
IS 'Planter/admin-only invite RPC. Accepts roles planter and team. Team members cannot invite.';

--------------------------------------------------------------------------------
-- 7. Tasks RLS. Any project member (planter/team) plus admins can read, write,
--    delete, and update instance tasks. Template writes are admin-only.
--------------------------------------------------------------------------------

CREATE POLICY "Allow project creation" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
    ((root_id IS NULL) OR (root_id = id))
    AND parent_task_id IS NULL
    AND creator = (SELECT auth.uid() AS uid)
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

CREATE POLICY "Allow subtask creation by members" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
    root_id IS NOT NULL
    AND (
        public.has_project_role(root_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

CREATE POLICY "Enable insert for authenticated users within project" ON public.tasks
FOR INSERT
WITH CHECK (
    (
        (
            auth.role() = 'authenticated'
            AND root_id IS NULL
            AND parent_task_id IS NULL
            AND creator = (SELECT auth.uid() AS uid)
        )
        OR public.has_project_role(root_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

CREATE POLICY "Enable delete for users" ON public.tasks
FOR DELETE
USING (
    creator = (SELECT auth.uid() AS uid)
    OR public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "Enable update for users" ON public.tasks
FOR UPDATE
USING (
    (
        creator = (SELECT auth.uid() AS uid)
        OR public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

CREATE POLICY "Enable read access for all users" ON public.tasks
FOR SELECT
USING (
    creator = (SELECT auth.uid() AS uid)
    OR public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

--------------------------------------------------------------------------------
-- 8. people / task_relationships / task_resources policies.
--------------------------------------------------------------------------------

CREATE POLICY "Manage people for planters" ON public.people
USING (
    public.has_project_role(project_id, (SELECT auth.uid() AS uid), ARRAY['planter'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "View people for project members" ON public.people
FOR SELECT
USING (
    public.has_project_role(project_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "Manage relationships" ON public.task_relationships
USING (
    public.has_project_role(project_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "View relationships" ON public.task_relationships
FOR SELECT
USING (
    public.has_project_role(project_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "Manage resources" ON public.task_resources
USING (
    (EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_resources.task_id
          AND (
              t.creator = (SELECT auth.uid() AS uid)
              OR public.has_project_role(COALESCE(t.root_id, t.id), (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
          )
    ))
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "View resources" ON public.task_resources
FOR SELECT
USING (
    (EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = task_resources.task_id
          AND (
              t.creator = (SELECT auth.uid() AS uid)
              OR public.has_project_role(COALESCE(t.root_id, t.id), (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
          )
    ))
    OR public.is_admin((SELECT auth.uid() AS uid))
);

--------------------------------------------------------------------------------
-- 9. project_members policies. SELECT visible to any project member; UPDATE
--    gated to Planters (and admins, via the bypass in the helper).
--------------------------------------------------------------------------------

CREATE POLICY "View project members" ON public.project_members
FOR SELECT
USING (
    public.has_project_role(project_id, (SELECT auth.uid() AS uid), ARRAY['planter', 'team'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

CREATE POLICY "members_update_policy" ON public.project_members
FOR UPDATE
USING (
    public.check_project_ownership_by_role(project_id, (SELECT auth.uid() AS uid))
    OR public.is_admin((SELECT auth.uid() AS uid))
)
WITH CHECK (
    user_id <> (SELECT auth.uid() AS uid)
    OR role <> 'team'
);

--------------------------------------------------------------------------------
-- 10. project_invites policies. Planters + admins only.
--------------------------------------------------------------------------------

CREATE POLICY "Create invites for project planters" ON public.project_invites
FOR INSERT
WITH CHECK (
    public.is_admin((SELECT auth.uid()))
    OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['planter'])
);

CREATE POLICY "Delete invites for project planters" ON public.project_invites
FOR DELETE
USING (
    public.is_admin((SELECT auth.uid()))
    OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['planter'])
);

CREATE POLICY "View invites for project planters" ON public.project_invites
FOR SELECT
USING (
    public.is_admin((SELECT auth.uid()))
    OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['planter'])
);

--------------------------------------------------------------------------------
-- 11. Roster sort. list_project_members_with_profiles now sorts planter
--     before team.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_project_members_with_profiles(p_project_id uuid)
RETURNS TABLE (
    id uuid,
    project_id uuid,
    user_id uuid,
    role text,
    joined_at timestamptz,
    email text,
    first_name text,
    last_name text,
    display_name text,
    avatar_url text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_authorized boolean;
BEGIN
    IF p_project_id IS NULL THEN
        RAISE EXCEPTION 'project_id is required';
    END IF;

    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'unauthorized: authentication required';
    END IF;

    SELECT
        public.is_admin(v_actor_id)
        OR EXISTS (
            SELECT 1
            FROM public.project_members pm
            WHERE pm.project_id = p_project_id
              AND pm.user_id    = v_actor_id
        )
    INTO v_authorized;

    IF NOT COALESCE(v_authorized, false) THEN
        RAISE EXCEPTION 'unauthorized: project membership required';
    END IF;

    RETURN QUERY
    WITH hydrated AS (
        SELECT
            pm.id,
            pm.project_id,
            pm.user_id,
            pm.role,
            pm.joined_at,
            u.email::text AS email,
            COALESCE(
                NULLIF(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                NULLIF(btrim(u.raw_user_meta_data ->> 'name'), '')
            ) AS full_name,
            NULLIF(btrim(u.raw_user_meta_data ->> 'first_name'), '') AS meta_first_name,
            NULLIF(btrim(u.raw_user_meta_data ->> 'last_name'), '') AS meta_last_name,
            NULLIF(btrim(u.raw_user_meta_data ->> 'avatar_url'), '') AS avatar_url
        FROM public.project_members pm
        LEFT JOIN auth.users u ON u.id = pm.user_id
        WHERE pm.project_id = p_project_id
    ),
    normalized AS (
        SELECT
            hydrated.id,
            hydrated.project_id,
            hydrated.user_id,
            hydrated.role,
            hydrated.joined_at,
            hydrated.email,
            COALESCE(
                hydrated.meta_first_name,
                NULLIF(split_part(COALESCE(hydrated.full_name, ''), ' ', 1), '')
            ) AS first_name,
            COALESCE(
                hydrated.meta_last_name,
                NULLIF(btrim(regexp_replace(COALESCE(hydrated.full_name, ''), '^[^[:space:]]+[[:space:]]*', '')), '')
            ) AS last_name,
            COALESCE(hydrated.full_name, hydrated.email, hydrated.user_id::text) AS display_name,
            hydrated.avatar_url
        FROM hydrated
    )
    SELECT
        normalized.id,
        normalized.project_id,
        normalized.user_id,
        normalized.role,
        normalized.joined_at,
        normalized.email,
        normalized.first_name,
        normalized.last_name,
        normalized.display_name,
        normalized.avatar_url
    FROM normalized
    ORDER BY
        CASE normalized.role
            WHEN 'planter' THEN 0
            WHEN 'team' THEN 1
            ELSE 2
        END,
        lower(COALESCE(normalized.display_name, normalized.email, normalized.user_id::text));
END;
$$;

COMMENT ON FUNCTION public.list_project_members_with_profiles(uuid)
IS 'Project-member/admin gated roster reader that hydrates safe auth.users profile fields. Sort order: planter, team.';
