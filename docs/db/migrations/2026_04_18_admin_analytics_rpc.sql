-- Wave 34 Task 3 — admin_analytics_snapshot RPC
--
-- Returns a single JSONB blob with every chart's payload. One round-trip for
-- the AdminAnalytics dashboard (vs. five separate queries). SECURITY DEFINER +
-- is_admin(auth.uid())-gated.
--
-- Additive only.

CREATE OR REPLACE FUNCTION public.admin_analytics_snapshot()
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

    SELECT jsonb_build_object(
        'totals', jsonb_build_object(
            'users', (SELECT count(*) FROM auth.users),
            'projects', (SELECT count(*) FROM public.tasks WHERE parent_task_id IS NULL AND origin = 'instance'),
            'active_projects_30d', (
                SELECT count(*)
                FROM public.tasks p
                WHERE p.parent_task_id IS NULL
                  AND p.origin = 'instance'
                  AND EXISTS (
                      SELECT 1 FROM public.tasks t
                      WHERE t.root_id = p.id
                        AND t.updated_at >= now() - interval '30 days'
                  )
            ),
            'new_users_30d', (
                SELECT count(*) FROM auth.users WHERE created_at >= now() - interval '30 days'
            )
        ),
        'new_projects_per_week', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('week_start', week_start, 'count', count)
                ORDER BY week_start ASC
            )
            FROM (
                SELECT
                    date_trunc('week', created_at)::date::text AS week_start,
                    count(*) AS count
                FROM public.tasks
                WHERE parent_task_id IS NULL
                  AND origin = 'instance'
                  AND created_at >= now() - interval '12 weeks'
                GROUP BY 1
            ) s
        ), '[]'::jsonb),
        'project_kind_breakdown', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('kind', kind_val, 'count', count_val))
            FROM (
                SELECT COALESCE(settings ->> 'project_kind', 'date') AS kind_val, count(*) AS count_val
                FROM public.tasks
                WHERE parent_task_id IS NULL AND origin = 'instance'
                GROUP BY 1
            ) k
        ), '[]'::jsonb),
        'task_status_breakdown', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object('status', status, 'count', count)
            )
            FROM (
                SELECT COALESCE(status, 'unknown') AS status, count(*) AS count
                FROM public.tasks
                WHERE origin = 'instance' AND parent_task_id IS NOT NULL
                GROUP BY 1
            ) s
        ), '[]'::jsonb),
        'most_active_users', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'user_id', user_id,
                    'email', email,
                    'display_name', display_name,
                    'tasks_created_30d', tasks_created_30d
                )
                ORDER BY tasks_created_30d DESC
            )
            FROM (
                SELECT
                    t.creator AS user_id,
                    u.email::text AS email,
                    COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email)::text AS display_name,
                    count(*) AS tasks_created_30d
                FROM public.tasks t
                JOIN auth.users u ON u.id = t.creator
                WHERE t.created_at >= now() - interval '30 days'
                  AND t.origin = 'instance'
                GROUP BY t.creator, u.email, u.raw_user_meta_data
                ORDER BY count(*) DESC
                LIMIT 10
            ) active
        ), '[]'::jsonb),
        'most_popular_templates', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'template_id', template_id,
                    'title', title,
                    'clone_count', clone_count
                )
                ORDER BY clone_count DESC
            )
            FROM (
                SELECT
                    template_id,
                    template_title AS title,
                    count(*) AS clone_count
                FROM (
                    SELECT
                        (t.settings ->> 'spawnedFromTemplate')::uuid AS template_id,
                        tpl.title AS template_title
                    FROM public.tasks t
                    LEFT JOIN public.tasks tpl ON tpl.id::text = t.settings ->> 'spawnedFromTemplate'
                    WHERE t.parent_task_id IS NULL
                      AND t.origin = 'instance'
                      AND t.settings ? 'spawnedFromTemplate'
                ) clones
                WHERE template_id IS NOT NULL
                GROUP BY template_id, template_title
                ORDER BY count(*) DESC
                LIMIT 10
            ) templates
        ), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_analytics_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_analytics_snapshot() TO authenticated;
