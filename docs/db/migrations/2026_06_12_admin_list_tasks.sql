-- Admin "Manage Tasks" — admin_list_tasks RPC
--
-- Paginated, filterable list of instance tasks (origin = 'instance', excluding
-- project roots) hydrated with project title + assignee email. SECURITY DEFINER
-- + is_admin(auth.uid())-gated. Mirrors admin_list_projects.
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.admin_list_tasks(
    filter jsonb DEFAULT '{}'::jsonb,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    title text,
    task_type text,
    status text,
    project_id uuid,
    project_title text,
    assignee_email text,
    due_date timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_status text := NULLIF(filter ->> 'status', '');
    v_task_type text := NULLIF(filter ->> 'taskType', '');
    v_project_id text := NULLIF(filter ->> 'projectId', '');
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
        t.task_type,
        t.status,
        t.root_id AS project_id,
        root.title AS project_title,
        u.email::text AS assignee_email,
        t.due_date,
        t.updated_at
    FROM public.tasks t
    LEFT JOIN public.tasks root ON root.id = t.root_id
    LEFT JOIN auth.users u ON u.id = t.assignee_id
    WHERE t.origin = 'instance'
      AND t.parent_task_id IS NOT NULL
      AND (v_status IS NULL OR v_status = 'all' OR t.status = v_status)
      AND (v_task_type IS NULL OR v_task_type = 'all' OR t.task_type = v_task_type)
      AND (v_project_id IS NULL OR v_project_id = 'all' OR t.root_id::text = v_project_id)
      AND (v_search_pattern IS NULL OR t.title ILIKE v_search_pattern ESCAPE '\')
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC
    LIMIT v_clamped_limit OFFSET v_clamped_offset;
END;
$$;

ALTER FUNCTION public.admin_list_tasks(jsonb, int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_tasks(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_tasks(jsonb, int, int) TO authenticated;
