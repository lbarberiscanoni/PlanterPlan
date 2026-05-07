-- PR 3: Align invite/member-management enforcement with the documented
-- Owner-only RBAC model. Editors keep task-edit permissions, but cannot
-- invite users, mutate invites, or use the invite RPC.

CREATE OR REPLACE FUNCTION public.get_user_id_by_email(email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(auth.users.email) = lower($1)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_user_id_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(text) TO service_role;

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

  IF p_role IS NULL OR p_role NOT IN ('owner', 'editor', 'coach', 'viewer', 'limited') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  v_is_admin := public.is_admin(auth.uid());

  SELECT role INTO v_inviter_role
  FROM public.project_members
  WHERE project_id = p_project_id
    AND user_id = auth.uid();

  IF NOT v_is_admin AND v_inviter_role IS DISTINCT FROM 'owner' THEN
    RAISE EXCEPTION 'Forbidden: only project owners can invite users.';
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
  SET role = EXCLUDED.role,
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
IS 'Owner/admin-only invite RPC. Editors retain task-edit rights but cannot invite or manage project members.';

GRANT SELECT, INSERT, DELETE ON TABLE public.project_invites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_invites TO service_role;

DROP POLICY IF EXISTS "Create invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "Delete invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "View invites for project members" ON public.project_invites;
DROP POLICY IF EXISTS "Create invites for project owners" ON public.project_invites;
DROP POLICY IF EXISTS "Delete invites for project owners" ON public.project_invites;
DROP POLICY IF EXISTS "View invites for project owners" ON public.project_invites;

CREATE POLICY "Create invites for project owners" ON public.project_invites
FOR INSERT
WITH CHECK (
  public.is_admin((SELECT auth.uid()))
  OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['owner'])
);

CREATE POLICY "Delete invites for project owners" ON public.project_invites
FOR DELETE
USING (
  public.is_admin((SELECT auth.uid()))
  OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['owner'])
);

CREATE POLICY "View invites for project owners" ON public.project_invites
FOR SELECT
USING (
  public.is_admin((SELECT auth.uid()))
  OR public.has_project_role(project_id, (SELECT auth.uid()), ARRAY['owner'])
);
