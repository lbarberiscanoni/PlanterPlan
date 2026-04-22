-- Wave 34 Task 1 — Admin RPCs
--
-- Three SECURITY DEFINER RPCs that let the /admin shell query across tenant
-- boundaries without loosening row-level RLS. Every function gates entry via
-- public.is_admin(auth.uid()) at the top of the body; non-admin callers
-- hit `RAISE EXCEPTION 'unauthorized: admin role required'` (loud on purpose).
--
-- The policies on `auth.users` and `public.activity_log` already cover admin
-- access for reads (admins inherit via is_admin OR in each SELECT policy), but
-- these RPCs bypass RLS for two reasons:
--   1. Joining auth.users columns into project-scoped views is painful from
--      the typed client (cross-schema FK is not modeled).
--   2. The admin feed must aggregate across projects the admin is not a
--      member of — the RPC route is simpler than multiplying OR branches
--      into every policy.
--
-- Additive only. No existing policy or table is modified.

CREATE OR REPLACE FUNCTION public.admin_search_users(
    p_query text,
    p_max_results int DEFAULT 20
)
RETURNS TABLE (
    id uuid,
    email text,
    display_name text,
    last_sign_in_at timestamptz,
    project_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_pattern text;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF p_query IS NULL OR char_length(trim(p_query)) < 2 THEN
        RETURN;
    END IF;

    -- Escape LIKE wildcards (%, _, \) so a user typing literal characters
    -- doesn't match cross-row. A trailing backslash is impossible after
    -- the replace chain because we escape it first.
    v_pattern := '%' ||
        replace(
            replace(
                replace(trim(p_query), '\', '\\'),
                '%', '\%'
            ),
            '_', '\_'
        ) || '%';

    RETURN QUERY
    SELECT
        u.id,
        u.email::text,
        COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email)::text AS display_name,
        u.last_sign_in_at,
        (
            SELECT count(*)
            FROM public.project_members pm
            WHERE pm.user_id = u.id
        ) AS project_count
    FROM auth.users u
    WHERE
        u.email ILIKE v_pattern ESCAPE '\'
        OR (u.raw_user_meta_data ->> 'full_name') ILIKE v_pattern ESCAPE '\'
    ORDER BY u.last_sign_in_at DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(p_max_results, 100));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_users(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_users(text, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_user_detail(
    p_uid uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF p_uid IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'profile', jsonb_build_object(
            'id', u.id,
            'email', u.email,
            'display_name', COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email),
            'last_sign_in_at', u.last_sign_in_at,
            'created_at', u.created_at,
            'is_admin', EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = u.id)
        ),
        'projects', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'project_id', pm.project_id,
                    'role', pm.role,
                    'project_title', r.title
                )
                ORDER BY r.title
            )
            FROM public.project_members pm
            LEFT JOIN public.tasks r ON r.id = pm.project_id
            WHERE pm.user_id = u.id
        ), '[]'::jsonb),
        'task_counts', jsonb_build_object(
            'assigned', COALESCE((
                SELECT count(*)
                FROM public.tasks t
                WHERE t.assignee_id = u.id AND t.origin = 'instance'
            ), 0),
            -- Counted via activity_log (Wave 27) rather than tasks.updated_at
            -- so unrelated edits on already-completed rows don't inflate the
            -- 30-day number. `task_completed` is the only status-transition
            -- action the log emits with `actor_id = completer` guaranteed.
            'completed', COALESCE((
                SELECT count(DISTINCT al.entity_id)
                FROM public.activity_log al
                WHERE al.actor_id = u.id
                  AND al.entity_type = 'task'
                  AND al.action = 'task_completed'
                  AND al.created_at >= now() - interval '30 days'
            ), 0),
            'overdue', COALESCE((
                SELECT count(*)
                FROM public.tasks t
                WHERE t.assignee_id = u.id
                  AND t.origin = 'instance'
                  AND t.status <> 'completed'
                  AND t.due_date IS NOT NULL
                  AND t.due_date < now()
            ), 0)
        )
    )
    INTO v_result
    FROM auth.users u
    WHERE u.id = p_uid;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_recent_activity(
    p_limit int DEFAULT 50
)
RETURNS TABLE (
    id uuid,
    project_id uuid,
    actor_id uuid,
    actor_email text,
    entity_type text,
    entity_id uuid,
    action text,
    payload jsonb,
    created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    RETURN QUERY
    SELECT
        al.id,
        al.project_id,
        al.actor_id,
        u.email::text AS actor_email,
        al.entity_type,
        al.entity_id,
        al.action,
        al.payload,
        al.created_at
    FROM public.activity_log al
    LEFT JOIN auth.users u ON u.id = al.actor_id
    ORDER BY al.created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_recent_activity(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_recent_activity(int) TO authenticated;
