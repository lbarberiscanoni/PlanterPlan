-- Wave 34 Task 2 — admin_list_users RPC
--
-- Paginated user list with server-side filters. Pushes role / last-login /
-- has-overdue / free-text search down to Postgres so the UI never loads
-- the full tenant roster. SECURITY DEFINER + is_admin(auth.uid())-gated.
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.admin_list_users(
    filter jsonb DEFAULT '{}'::jsonb,
    p_limit int DEFAULT 50,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    email text,
    display_name text,
    last_sign_in_at timestamptz,
    is_admin boolean,
    active_project_count bigint,
    completed_tasks_30d bigint,
    overdue_task_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_role text := filter ->> 'role';
    v_last_login text := filter ->> 'lastLogin';
    v_has_overdue boolean := (filter ->> 'hasOverdue')::boolean;
    v_search text := NULLIF(trim(COALESCE(filter ->> 'search', '')), '');
    v_search_pattern text;
    v_clamped_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
    v_clamped_offset int := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    -- Escape LIKE wildcards so a user typing '%' or '_' doesn't match every
    -- row. Backslash is escaped first so the subsequent replaces don't
    -- insert literal backslashes that collide with the ESCAPE character.
    IF v_search IS NOT NULL THEN
        v_search_pattern := '%' ||
            replace(
                replace(
                    replace(v_search, '\', '\\'),
                    '%', '\%'
                ),
                '_', '\_'
            ) || '%';
    END IF;

    RETURN QUERY
    WITH base AS (
        SELECT
            u.id,
            u.email::text AS email,
            COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email)::text AS display_name,
            u.last_sign_in_at,
            EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = u.id) AS is_admin,
            (
                SELECT count(*)
                FROM public.project_members pm
                WHERE pm.user_id = u.id
            ) AS active_project_count,
            -- Counted via activity_log (Wave 27) so unrelated edits on already-
            -- completed rows don't inflate the 30-day number. See the sibling
            -- admin_user_detail RPC for the same pattern.
            (
                SELECT count(DISTINCT al.entity_id)
                FROM public.activity_log al
                WHERE al.actor_id = u.id
                  AND al.entity_type = 'task'
                  AND al.action = 'task_completed'
                  AND al.created_at >= now() - interval '30 days'
            ) AS completed_tasks_30d,
            (
                SELECT count(*)
                FROM public.tasks t
                WHERE t.assignee_id = u.id
                  AND t.origin = 'instance'
                  AND t.status <> 'completed'
                  AND t.due_date IS NOT NULL
                  AND t.due_date < now()
            ) AS overdue_task_count
        FROM auth.users u
    )
    SELECT
        b.id,
        b.email,
        b.display_name,
        b.last_sign_in_at,
        b.is_admin,
        b.active_project_count,
        b.completed_tasks_30d,
        b.overdue_task_count
    FROM base b
    WHERE
        (v_role IS NULL OR v_role = 'all' OR
            (v_role = 'admin' AND b.is_admin = true) OR
            (v_role = 'standard' AND b.is_admin = false)
        )
        AND (v_last_login IS NULL OR v_last_login = 'all' OR
            (v_last_login = 'last_7' AND b.last_sign_in_at >= now() - interval '7 days') OR
            (v_last_login = 'last_30' AND b.last_sign_in_at >= now() - interval '30 days') OR
            (v_last_login = 'inactive' AND (b.last_sign_in_at IS NULL OR b.last_sign_in_at < now() - interval '30 days'))
        )
        AND (v_has_overdue IS NULL OR v_has_overdue = false OR b.overdue_task_count > 0)
        AND (v_search_pattern IS NULL
            OR b.email ILIKE v_search_pattern ESCAPE '\'
            OR b.display_name ILIKE v_search_pattern ESCAPE '\')
    ORDER BY b.last_sign_in_at DESC NULLS LAST, b.email ASC
    LIMIT v_clamped_limit OFFSET v_clamped_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users(jsonb, int, int) TO authenticated;
