-- PR 4: Hydrate project-member rosters through a trusted DB boundary.
-- Project members and global admins can read safe profile fields for the
-- selected project; non-members cannot use the RPC as an auth.users oracle.

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
        AND pm.user_id = v_actor_id
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
      WHEN 'owner' THEN 0
      WHEN 'editor' THEN 1
      WHEN 'coach' THEN 2
      WHEN 'viewer' THEN 3
      WHEN 'limited' THEN 4
      ELSE 5
    END,
    lower(COALESCE(normalized.display_name, normalized.email, normalized.user_id::text));
END;
$$;

COMMENT ON FUNCTION public.list_project_members_with_profiles(uuid)
IS 'Project-member/admin gated roster reader that hydrates safe auth.users profile fields for team UI labels.';

REVOKE ALL ON FUNCTION public.list_project_members_with_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_project_members_with_profiles(uuid) TO authenticated;

DROP POLICY IF EXISTS "members_delete_policy" ON public.project_members;

CREATE POLICY "members_delete_policy" ON public.project_members
FOR DELETE
USING (
  user_id = (SELECT auth.uid())
  OR public.is_admin((SELECT auth.uid()))
  OR public.check_project_ownership_by_role(project_id, (SELECT auth.uid()))
);
