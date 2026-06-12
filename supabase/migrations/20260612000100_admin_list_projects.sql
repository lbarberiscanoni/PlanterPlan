-- Admin "Manage Projects" — admin_list_projects RPC
--
-- Paginated, filterable list of instance project roots (parent_task_id IS NULL,
-- origin = 'instance') with owner email + member/task counts. SECURITY DEFINER
-- + is_admin(auth.uid())-gated. Mirrors admin_list_users.
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.admin_list_projects(
    filter jsonb DEFAULT '{}'::jsonb,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    title text,
    owner_email text,
    member_count bigint,
    task_count bigint,
    status text,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_status text := NULLIF(filter ->> 'status', '');
    v_search text := NULLIF(trim(COALESCE(filter ->> 'search', '')), '');
    v_search_pattern text;
    v_clamped_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
    v_clamped_offset int := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF v_search IS NOT NULL THEN
        v_search_pattern := '%' ||
            replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.title,
        u.email::text AS owner_email,
        (SELECT count(*) FROM public.project_members pm WHERE pm.project_id = t.id) AS member_count,
        (SELECT count(*) FROM public.tasks c WHERE c.root_id = t.id AND c.id <> t.id) AS task_count,
        t.status,
        t.created_at,
        t.updated_at
    FROM public.tasks t
    LEFT JOIN auth.users u ON u.id = t.creator
    WHERE t.parent_task_id IS NULL
      AND t.origin = 'instance'
      AND (v_status IS NULL OR v_status = 'all' OR t.status = v_status)
      AND (v_search_pattern IS NULL OR t.title ILIKE v_search_pattern ESCAPE '\')
    ORDER BY t.created_at DESC NULLS LAST, t.title ASC
    LIMIT v_clamped_limit OFFSET v_clamped_offset;
END;
$$;

ALTER FUNCTION public.admin_list_projects(jsonb, int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_projects(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_projects(jsonb, int, int) TO authenticated;
