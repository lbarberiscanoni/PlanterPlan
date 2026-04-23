-- Admin moderation prerequisite: expose `banned_until` on the admin user
-- detail payload so the AdminUsers detail-aside can toggle between
-- "Suspend" and "Unsuspend" affordances without a separate lookup.
--
-- Supabase's `auth.users.banned_until` is a timestamp: when non-null AND
-- in the future, the user cannot sign in. We surface the raw timestamp
-- (client decides how to render "suspended until Jul 4" vs "indefinite").
--
-- CREATE OR REPLACE keeps the existing signature and grant chain — no
-- REVOKE/GRANT reshuffling needed.

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
            'is_admin', EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = u.id),
            -- NEW: banned_until — non-null + in-the-future means currently suspended.
            -- Client renders "Suspended until {date}" or "Suspended indefinitely"
            -- based on the distance from `now()`.
            'banned_until', u.banned_until
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
