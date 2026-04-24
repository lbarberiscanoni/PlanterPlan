


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pgsodium";








ALTER SCHEMA "public" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."task_resource_type" AS ENUM (
    'pdf',
    'url',
    'text'
);


ALTER TYPE "public"."task_resource_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_task_date_rollup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_parent_id uuid;
    v_min_start timestamptz;
    v_max_due timestamptz;
BEGIN
    -- Recursion Guard to prevent stack overflow
    IF pg_trigger_depth() > 10 THEN
        RETURN NULL;
    END IF;

    -- Determine parent to update
    IF TG_OP = 'DELETE' THEN
        v_parent_id := OLD.parent_task_id;
    ELSE
        v_parent_id := NEW.parent_task_id;
    END IF;

    -- If no parent or parent is null, stop recursion
    IF v_parent_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Calculate Min Start and Max Due from siblings
    SELECT MIN(start_date), MAX(due_date)
    INTO v_min_start, v_max_due
    FROM public.tasks
    WHERE parent_task_id = v_parent_id;

    -- Update Parent
    UPDATE public.tasks
    SET 
        start_date = v_min_start,
        due_date = v_max_due
    WHERE id = v_parent_id
      AND (start_date IS DISTINCT FROM v_min_start OR due_date IS DISTINCT FROM v_max_due);

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."calc_task_date_rollup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_phase_unlock"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_milestone_id uuid;
    v_phase_id uuid;
    v_incomplete_exists boolean;
BEGIN
    -- Only process completions
    IF NEW.is_complete = false THEN RETURN NULL; END IF;
    IF NEW.parent_task_id IS NULL THEN RETURN NULL; END IF;

    -- 1. Identify Phase ID
    -- Assume we are at Task level (Parent is Milestone)
    v_milestone_id := NEW.parent_task_id;
    SELECT parent_task_id INTO v_phase_id 
    FROM public.tasks 
    WHERE id = v_milestone_id;

    -- If parent of parent is usually NULL (e.g. if NEW was a Milestone), handle gracefully?
    -- In PlanterPlan: Task -> Milestone -> Phase -> Project.
    -- If NEW is Task, then v_milestone_id is Milestone, v_phase_id is Phase.
    
    IF v_phase_id IS NULL THEN
        -- Fallback: Maybe NEW was a Milestone? Then parent is Phase.
        v_phase_id := v_milestone_id;
    END IF;

    -- 2. Check if ANY incomplete tasks remain in this Phase (across all milestones)
    SELECT EXISTS (
        SELECT 1
        FROM public.tasks EndTask
        JOIN public.tasks MidMilestone ON EndTask.parent_task_id = MidMilestone.id
        WHERE MidMilestone.parent_task_id = v_phase_id
          AND EndTask.is_complete = false
    ) INTO v_incomplete_exists;

    -- 3. If Phase Complete -> Unlock Dependent Phases
    IF NOT v_incomplete_exists THEN
        UPDATE public.tasks
        SET is_locked = false
        WHERE prerequisite_phase_id = v_phase_id;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."check_phase_unlock"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_project_creatorship"("p_id" "uuid", "u_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Wave 23: correctly-named replacement for `check_project_ownership`.
  -- Checks whether `u_id` CREATED the project (tasks.creator), not whether
  -- they are an `owner`-role member in project_members.
  -- See docs/db/migrations/2026_04_17_rename_project_creatorship.sql.
  RETURN EXISTS (
    SELECT 1
    FROM public.tasks
    WHERE id = p_id
      AND creator = u_id
  );
END;
$$;


ALTER FUNCTION "public"."check_project_creatorship"("p_id" "uuid", "u_id" "uuid") OWNER TO "postgres";


-- Wave 24: canonical ownership check. Unlike `check_project_creatorship`, a
-- user who is removed from `project_members` stops passing this check — which
-- is what the DELETE/UPDATE policies on project_members actually want.
-- See docs/db/migrations/2026_04_18_rewrite_project_members_policies.sql.
CREATE OR REPLACE FUNCTION "public"."check_project_ownership_by_role"("p_id" "uuid", "u_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = p_id
      AND user_id    = u_id
      AND role       = 'owner'
  );
END;
$$;


ALTER FUNCTION "public"."check_project_ownership_by_role"("p_id" "uuid", "u_id" "uuid") OWNER TO "postgres";


-- Wave 29: Phase Lead. Recursive ancestor walk returning TRUE when any
-- ancestor (EXCLUDING the target row itself) carries
-- `settings -> 'phase_lead_user_ids'` containing uid. Excluding self is
-- load-bearing: a Phase Lead on milestone M may UPDATE tasks under M but
-- NOT the row M itself (owner-level gate on lead assignment).
CREATE OR REPLACE FUNCTION "public"."user_is_phase_lead"("target_task_id" "uuid", "uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  WITH RECURSIVE ancestors AS (
    SELECT parent_task_id
    FROM public.tasks
    WHERE id = target_task_id
    UNION ALL
    SELECT t.parent_task_id
    FROM public.tasks t
    JOIN ancestors a ON t.id = a.parent_task_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM ancestors a
    JOIN public.tasks t ON t.id = a.parent_task_id
    WHERE t.settings ? 'phase_lead_user_ids'
      AND (t.settings -> 'phase_lead_user_ids') ? uid::text
  );
$$;


ALTER FUNCTION "public"."user_is_phase_lead"("target_task_id" "uuid", "uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bump_template_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF OLD.origin = 'template' AND NEW.origin = 'template' THEN
        IF
            COALESCE(NEW.title, '') IS DISTINCT FROM COALESCE(OLD.title, '')
            OR COALESCE(NEW.description, '') IS DISTINCT FROM COALESCE(OLD.description, '')
            OR COALESCE(NEW.days_from_start, -1) IS DISTINCT FROM COALESCE(OLD.days_from_start, -1)
            OR COALESCE(NEW.settings, '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.settings, '{}'::jsonb)
        THEN
            NEW.template_version := COALESCE(OLD.template_version, 0) + 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bump_template_version"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_users"("p_query" "text", "p_max_results" integer DEFAULT 20) RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text", "last_sign_in_at" timestamp with time zone, "project_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_search_users"("p_query" "text", "p_max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_user_detail"("p_uid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_user_detail"("p_uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_recent_activity"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "project_id" "uuid", "actor_id" "uuid", "actor_email" "text", "entity_type" "text", "entity_id" "uuid", "action" "text", "payload" "jsonb", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_recent_activity"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_users"("filter" "jsonb" DEFAULT '{}'::"jsonb", "p_limit" integer DEFAULT 50, "p_offset" integer DEFAULT 0) RETURNS TABLE("id" "uuid", "email" "text", "display_name" "text", "last_sign_in_at" timestamp with time zone, "is_admin" boolean, "active_project_count" bigint, "completed_tasks_30d" bigint, "overdue_task_count" bigint)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."admin_list_users"("filter" "jsonb", "p_limit" integer, "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_analytics_snapshot"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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
                SELECT date_trunc('week', created_at)::date::text AS week_start, count(*) AS count
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
            SELECT jsonb_agg(jsonb_build_object('status', status, 'count', count))
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
                SELECT template_id, template_title AS title, count(*) AS clone_count
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


ALTER FUNCTION "public"."admin_analytics_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_user_admin_role"("p_target_uid" "uuid", "p_make_admin" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_caller uuid := auth.uid();
    v_target_email text;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION 'unauthorized: not authenticated';
    END IF;

    IF NOT public.is_admin(v_caller) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF v_caller = p_target_uid AND p_make_admin = FALSE THEN
        RAISE EXCEPTION 'self_demotion_forbidden: remove your own admin flag via service_role';
    END IF;

    SELECT u.email INTO v_target_email
    FROM auth.users u
    WHERE u.id = p_target_uid;

    IF v_target_email IS NULL THEN
        RAISE EXCEPTION 'target_not_found: no auth.users row with id %', p_target_uid;
    END IF;

    IF p_make_admin THEN
        INSERT INTO public.admin_users (user_id, email)
        VALUES (p_target_uid, v_target_email)
        ON CONFLICT (user_id) DO NOTHING;
    ELSE
        DELETE FROM public.admin_users
        WHERE user_id = p_target_uid;
    END IF;

    INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
    VALUES (
        NULL,
        v_caller,
        'member',
        p_target_uid,
        CASE WHEN p_make_admin THEN 'admin_granted' ELSE 'admin_revoked' END,
        jsonb_build_object('target_email', v_target_email)
    );
END;
$$;


ALTER FUNCTION "public"."admin_set_user_admin_role"("p_target_uid" "uuid", "p_make_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_search_root_tasks"("p_query" "text", "p_origin" "text" DEFAULT NULL::"text", "p_max_results" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "title" "text", "origin" "text")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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

    IF p_origin IS NOT NULL AND p_origin NOT IN ('instance', 'template') THEN
        RAISE EXCEPTION 'invalid origin filter: %', p_origin;
    END IF;

    v_pattern := '%' ||
        replace(
            replace(
                replace(trim(p_query), '\', '\\'),
                '%', '\%'
            ),
            '_', '\_'
        ) || '%';

    RETURN QUERY
    SELECT t.id, t.title, t.origin
    FROM public.tasks t
    WHERE t.parent_task_id IS NULL
      AND t.origin IN ('instance', 'template')
      AND (p_origin IS NULL OR t.origin = p_origin)
      AND COALESCE(t.title, '') ILIKE v_pattern ESCAPE '\'
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_max_results, 10), 100));
END;
$$;


ALTER FUNCTION "public"."admin_search_root_tasks"("p_query" "text", "p_origin" "text", "p_max_results" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_template_roots"() RETURNS TABLE("id" "uuid", "title" "text", "template_version" integer, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    RETURN QUERY
    SELECT t.id, t.title, COALESCE(t.template_version, 1), t.updated_at
    FROM public.tasks t
    WHERE t.parent_task_id IS NULL
      AND t.origin = 'template'
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC;
END;
$$;


ALTER FUNCTION "public"."admin_template_roots"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_template_clones"("p_template_id" "uuid") RETURNS TABLE("project_id" "uuid", "title" "text", "cloned_from_template_version" integer, "current_template_version" integer, "stale" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_current_version int;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    SELECT COALESCE(t.template_version, 1)
    INTO v_current_version
    FROM public.tasks t
    WHERE t.id = p_template_id
      AND t.parent_task_id IS NULL
      AND t.origin = 'template';

    IF v_current_version IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.title,
        CASE
            WHEN jsonb_typeof(i.settings -> 'cloned_from_template_version') = 'number'
                THEN (i.settings ->> 'cloned_from_template_version')::int
            ELSE NULL
        END AS cloned_from_template_version,
        v_current_version AS current_template_version,
        CASE
            WHEN jsonb_typeof(i.settings -> 'cloned_from_template_version') = 'number'
                THEN (i.settings ->> 'cloned_from_template_version')::int < v_current_version
            ELSE false
        END AS stale
    FROM public.tasks i
    WHERE i.parent_task_id IS NULL
      AND i.origin = 'instance'
      AND i.settings ->> 'spawnedFromTemplate' = p_template_id::text
    ORDER BY i.updated_at DESC NULLS LAST, i.title ASC;
END;
$$;


ALTER FUNCTION "public"."admin_template_clones"("p_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clone_project_template"("p_template_id" "uuid", "p_new_parent_id" "uuid", "p_new_origin" "text", "p_user_id" "uuid", "p_title" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_start_date" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_due_date" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$

DECLARE
    v_new_root_id uuid;
    v_top_new_id uuid;
    v_tasks_count int;
    v_old_start_date timestamptz;
    v_interval interval;
    v_template_root_id uuid;
    v_template_origin text;
    v_template_creator uuid;
    v_template_published boolean := false;
    v_actor_id uuid := auth.uid();
BEGIN
    IF v_actor_id IS NULL OR p_user_id IS NULL OR p_user_id <> v_actor_id THEN
        RAISE EXCEPTION 'Access denied: authenticated user mismatch.';
    END IF;

    IF p_new_origin IS NULL OR p_new_origin NOT IN ('instance', 'template') THEN
        RAISE EXCEPTION 'Invalid clone origin: %', p_new_origin;
    END IF;

    SELECT
        COALESCE(t.root_id, t.id),
        r.origin,
        r.creator,
        lower(COALESCE(r.settings ->> 'published', 'false')) = 'true',
        t.start_date
    INTO
        v_template_root_id,
        v_template_origin,
        v_template_creator,
        v_template_published,
        v_old_start_date
    FROM public.tasks t
    LEFT JOIN public.tasks r ON r.id = COALESCE(t.root_id, t.id)
    WHERE t.id = p_template_id;

    IF v_template_root_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: template task not found.';
    END IF;

    IF NOT (
        public.is_admin(v_actor_id)
        OR (
            v_template_origin = 'template'
            AND (v_template_published OR v_template_creator = v_actor_id)
        )
        OR (
            v_template_origin <> 'template'
            AND public.has_permission(v_template_root_id, v_actor_id, 'member')
        )
    ) THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to access this template.';
    END IF;

    IF p_new_origin = 'template' AND NOT public.is_admin(v_actor_id) THEN
        RAISE EXCEPTION 'Access denied: only admins can create template clones.';
    END IF;

    -- Calculate Interval Offset if both dates exist
    IF p_start_date IS NOT NULL AND v_old_start_date IS NOT NULL THEN
        -- Calculate difference. casting to date removes time component which is usually safer for "whole day" shifts
        v_interval := (p_start_date::date - v_old_start_date::date) * '1 day'::interval;
    ELSE
        v_interval := '0 days'::interval;
    END IF;

    -- 1. Create Temp Table for ID Mapping (Task)
    CREATE TEMP TABLE IF NOT EXISTS temp_task_map (
        old_id uuid PRIMARY KEY,
        new_id uuid
    ) ON COMMIT DROP;

    -- 2. Create Temp Table for ID Mapping (Resource)
    CREATE TEMP TABLE IF NOT EXISTS temp_res_map (
        old_id uuid PRIMARY KEY,
        new_id uuid
    ) ON COMMIT DROP;

    -- 3. Identify all tasks in the subtree
    WITH RECURSIVE subtree AS (
        SELECT id FROM public.tasks WHERE id = p_template_id
        UNION ALL
        SELECT t.id FROM public.tasks t JOIN subtree s ON t.parent_task_id = s.id
    )
    INSERT INTO temp_task_map (old_id, new_id)
    SELECT id, gen_random_uuid() FROM subtree;

    -- Capture new ID of the top node
    SELECT new_id INTO v_top_new_id FROM temp_task_map WHERE old_id = p_template_id;
    
    -- 4. Determine Root ID
    IF p_new_parent_id IS NULL THEN
        v_new_root_id := v_top_new_id;
    ELSE
        SELECT COALESCE(root_id, id) INTO v_new_root_id FROM public.tasks WHERE id = p_new_parent_id;
        IF v_new_root_id IS NULL THEN
             RAISE EXCEPTION 'Parent task % has no root_id', p_new_parent_id;
        END IF;

        IF NOT public.is_admin(v_actor_id)
            AND NOT public.has_project_role(v_new_root_id, v_actor_id, ARRAY['owner', 'editor'])
        THEN
            RAISE EXCEPTION 'Access denied: You do not have permission to modify the destination project.';
        END IF;
    END IF;

    -- 5. Insert New Tasks
    INSERT INTO public.tasks (
        id, parent_task_id, root_id, creator, origin, 
        title, description, status, position, 
        notes, purpose, actions, is_complete, days_from_start, start_date, due_date,
        cloned_from_task_id
    )
    SELECT 
        m.new_id, 
        CASE 
            WHEN t.id = p_template_id THEN p_new_parent_id -- Top node gets new parent
            ELSE mp.new_id  -- Others get mapped parent
        END,
        v_new_root_id,
        v_actor_id,
        p_new_origin,
        -- Override Title/Desc for Root if provided
        CASE WHEN t.id = p_template_id AND p_title IS NOT NULL THEN p_title ELSE t.title END,
        CASE WHEN t.id = p_template_id AND p_description IS NOT NULL THEN p_description ELSE t.description END,
        t.status, t.position,
        t.notes, t.purpose, t.actions, false, t.days_from_start, 
        -- Set Dates:
        -- 1. If Root: Use provided p_start_date (or original if null, but usually we want override)
        -- 2. If Child: Shift by v_interval
        CASE 
            WHEN t.id = p_template_id THEN p_start_date 
            WHEN t.start_date IS NOT NULL THEN t.start_date + v_interval
            ELSE null 
        END,
        CASE 
            WHEN t.id = p_template_id THEN p_due_date 
            WHEN t.due_date IS NOT NULL THEN t.due_date + v_interval
            ELSE null 
        END,
        t.id
    FROM public.tasks t
    JOIN temp_task_map m ON t.id = m.old_id
    LEFT JOIN temp_task_map mp ON t.parent_task_id = mp.old_id;

    -- 6. Identify Resources to clone
    INSERT INTO temp_res_map (old_id, new_id)
    SELECT r.id, gen_random_uuid()
    FROM public.task_resources r
    JOIN temp_task_map tm ON r.task_id = tm.old_id;

    -- 7. Insert New Resources
    INSERT INTO public.task_resources (
        id, task_id, resource_type, resource_url, resource_text, storage_path, storage_bucket
    )
    SELECT 
        rm.new_id,
        tm.new_id,
        r.resource_type, r.resource_url, r.resource_text, r.storage_path, r.storage_bucket
    FROM public.task_resources r
    JOIN temp_res_map rm ON r.id = rm.old_id
    JOIN temp_task_map tm ON r.task_id = tm.old_id;

    -- 8. Update Primary Resource Pointers on New Tasks
    UPDATE public.tasks t
    SET primary_resource_id = rm.new_id
    FROM public.tasks original
    JOIN temp_task_map tm ON original.id = tm.old_id
    JOIN temp_res_map rm ON original.primary_resource_id = rm.old_id
    WHERE t.id = tm.new_id;

    -- 9. Return result
    SELECT COUNT(*) INTO v_tasks_count FROM temp_task_map;

    RETURN jsonb_build_object(
        'new_root_id', v_top_new_id,
        'root_project_id', v_new_root_id,
        'tasks_cloned', v_tasks_count
    );
END;
$$;


ALTER FUNCTION "public"."clone_project_template"("p_template_id" "uuid", "p_new_parent_id" "uuid", "p_new_origin" "text", "p_user_id" "uuid", "p_title" "text", "p_description" "text", "p_start_date" timestamp with time zone, "p_due_date" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."derive_task_type"("p_parent_task_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_parent uuid := p_parent_task_id;
    v_grandparent uuid;
    v_great_grandparent uuid;
BEGIN
    -- Wave 25: classify a task by its depth in the parent_task_id tree.
    -- See docs/db/migrations/2026_04_18_task_type_discriminator.sql.
    IF v_parent IS NULL THEN
        RETURN 'project';
    END IF;

    SELECT parent_task_id INTO v_grandparent
      FROM public.tasks
     WHERE id = v_parent;

    IF v_grandparent IS NULL THEN
        RETURN 'phase';
    END IF;

    SELECT parent_task_id INTO v_great_grandparent
      FROM public.tasks
     WHERE id = v_grandparent;

    IF v_great_grandparent IS NULL THEN
        RETURN 'milestone';
    END IF;

    RETURN 'task';
END;
$$;


ALTER FUNCTION "public"."derive_task_type"("p_parent_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_details"("p_token" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_invite public.project_invites%ROWTYPE;
  v_project_title text;
BEGIN
  -- 1. Find the invite
  SELECT * INTO v_invite
  FROM public.project_invites
  WHERE token = p_token
  AND expires_at > now();

  IF v_invite IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  -- 2. Get Project Title (Securely, bypassing RLS via SECURITY DEFINER)
  SELECT title INTO v_project_title
  FROM public.tasks
  WHERE id = v_invite.project_id;

  -- 3. Return safe details
  RETURN jsonb_build_object(
    'email', v_invite.email,
    'role', v_invite.role,
    'project_id', v_invite.project_id,
    'project_title', v_project_title
  );
END;
$$;


ALTER FUNCTION "public"."get_invite_details"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_task_root_id"("p_task_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_root_id uuid;
BEGIN
  -- Use a distinct variable and table alias to guarantee no ambiguity.
  SELECT t.root_id INTO v_root_id
  FROM public.tasks t
  WHERE t.id = p_task_id;

  RETURN v_root_id;
END;
$$;


ALTER FUNCTION "public"."get_task_root_id"("p_task_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
  select id from auth.users where email = $1;
$_$;


ALTER FUNCTION "public"."get_user_id_by_email"("email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_phase_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_next_task_id uuid;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    SELECT id INTO v_next_task_id
    FROM public.tasks
    WHERE parent_task_id = NEW.parent_task_id
      AND position > NEW.position
    ORDER BY position ASC
    LIMIT 1;

    IF v_next_task_id IS NOT NULL THEN
      UPDATE public.tasks
      SET is_locked = false
      WHERE id = v_next_task_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_phase_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_permission"("p_project_id" "uuid", "p_user_id" "uuid", "p_required_role" "text" DEFAULT 'member') RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."has_permission"("p_project_id" "uuid", "p_user_id" "uuid", "p_required_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_project_role"("pid" "uuid", "uid" "uuid", "allowed_roles" "text"[]) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_id = pid
        AND user_id = uid
        AND role = ANY(allowed_roles)
    );
END;
$$;


ALTER FUNCTION "public"."has_project_role"("pid" "uuid", "uid" "uuid", "allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_default_project"("p_project_id" "uuid", "p_creator_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_phase_id uuid;
    v_milestone_id uuid;
    v_task_count int := 0;
BEGIN
    -- 0. PRE-FLIGHT: Security Check
    IF auth.uid() <> p_creator_id THEN
        RAISE EXCEPTION 'Access Denied: You can only create projects for yourself.';
    END IF;

    -- 0. CRITICAL: Security Bootstrap
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (p_project_id, p_creator_id, 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;

    -- 1. Discovery Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 1, 'Discovery', 'Assess calling, gather resources, foundation', '{"color": "blue", "icon": "compass"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
    
        -- Milestones for Discovery
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 1, 'Personal Assessment', 'Evaluate your calling and readiness', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Review and complete assessment', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Schedule planning meeting', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 2, 'Family Preparation', 'Prepare your family for the journey', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Family vision night', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Discuss expectations', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 3, 'Resource Gathering', 'Identify available resources and support', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'List potential partners', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Research planting grants', 'medium', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 3, 'Create budget draft', 'high', 'not_started', 'instance');
            v_task_count := v_task_count + 3;

    -- 2. Planning Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 2, 'Planning', 'Develop strategy, vision, and initial team', '{"color": "purple", "icon": "map"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;

        -- Milestones for Planning
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 1, 'Vision Development', 'Clarify your vision and mission', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Write vision statement', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Define core values', 'high', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 2, 'Strategic Planning', 'Develop your launch strategy', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Demographic study', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Define target audience', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;
            
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 3, 'Core Team Building', 'Recruit and develop your core team', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Host interest meetings', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Start small group', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

    -- 3. Preparation Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 3, 'Preparation', 'Build systems, recruit team, prepare for launch', '{"color": "orange", "icon": "wrench"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 1, 'Systems Setup', 'Establish operational systems', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Select ChMS', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Setup bank account', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 2, 'Facility Planning', 'Secure meeting location', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Visit potential venues', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Sign lease/agreement', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 3, 'Ministry Development', 'Develop key ministry areas', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Kids ministry strategy', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Worship team auditions', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

    -- 4. Pre-Launch Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 4, 'Pre-Launch', 'Final preparations, preview services, marketing', '{"color": "green", "icon": "rocket"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 1, 'Preview Services', 'Host preview gatherings', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Plan first preview service', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Debrief preview service', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 2, 'Marketing Launch', 'Begin community outreach', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Launch social media ads', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Send mailers', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;
             
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 3, 'Final Preparations', 'Complete all launch requirements', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Order connection cards', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Finalize volunteer schedule', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

    -- 5. Launch Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 5, 'Launch', 'Grand opening and initial growth phase', '{"color": "yellow", "icon": "zap"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 1, 'Launch Week', 'Execute your launch plan', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES (p_project_id, v_milestone_id, p_creator_id, 1, 'Launch Sunday!', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 1;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 2, 'First Month', 'Establish weekly rhythms', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 3, 'Guest Follow-up', 'Connect with visitors', 'instance', 'not_started') RETURNING id INTO v_milestone_id;

    -- 6. Growth Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 6, 'Growth', 'Establish systems, develop leaders, expand reach', '{"color": "pink", "icon": "trending-up"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 1, 'Leadership Development', 'Train and empower leaders', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 2, 'Ministry Expansion', 'Launch additional ministries', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES 
        (p_project_id, v_phase_id, p_creator_id, 3, 'Future Planning', 'Plan for multiplication', 'instance', 'not_started') RETURNING id INTO v_milestone_id;


    RETURN jsonb_build_object(
        'success', true,
        'project_id', p_project_id,
        'tasks_created', v_task_count
    );
END;
$$;


ALTER FUNCTION "public"."initialize_default_project"("p_project_id" "uuid", "p_creator_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_project"("p_project_id" "uuid", "p_email" "text", "p_role" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
  v_invite_id uuid;
  v_token uuid;
  v_inviter_role text;
  v_is_admin boolean;
BEGIN
  -- Check if user is admin
  v_is_admin := public.is_admin(auth.uid());

  -- Get Inviter's Role
  SELECT role INTO v_inviter_role
  FROM public.project_members
  WHERE project_id = p_project_id
  AND user_id = auth.uid();

  -- 1. Authorization Gate
  IF v_inviter_role IS NULL OR (v_inviter_role NOT IN ('owner', 'editor') AND NOT v_is_admin) THEN
    RAISE EXCEPTION 'Access denied: You must be an owner or editor to invite members.';
  END IF;

  -- 2. Privilege Escalation Check (Editor cannot invite Owner)
  IF v_inviter_role = 'editor' AND p_role = 'owner' THEN
     RAISE EXCEPTION 'Access denied: Editors cannot assign the Owner role.';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;

  IF v_user_id IS NOT NULL THEN
    -- Existing User Logic
    
    -- 3. Update Protection (Editor cannot change an existing Owner's role)
    IF v_inviter_role = 'editor' THEN
        IF EXISTS (
            SELECT 1 FROM public.project_members 
            WHERE project_id = p_project_id 
            AND user_id = v_user_id 
            AND role = 'owner'
        ) THEN
            RAISE EXCEPTION 'Access denied: Editors cannot modify an Owner.';
        END IF;
    END IF;

    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (p_project_id, v_user_id, p_role)
    ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = EXCLUDED.role;

    RETURN jsonb_build_object(
      'status', 'added',
      'user_id', v_user_id
    );
  ELSE
    -- Non-existing User (Invite) Logic
    INSERT INTO public.project_invites (project_id, email, role)
    VALUES (p_project_id, p_email, p_role)
    ON CONFLICT (project_id, email) DO UPDATE
    SET role = EXCLUDED.role, expires_at = (now() + interval '7 days')
    RETURNING id, token INTO v_invite_id, v_token;

    RETURN jsonb_build_object(
      'status', 'invited',
      'invite_id', v_invite_id,
      'token', v_token
    );
  END IF;
END;
$$;


ALTER FUNCTION "public"."invite_user_to_project"("p_project_id" "uuid", "p_email" "text", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_active_member"("p_project_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.project_members
    WHERE project_id = p_project_id
      AND user_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_active_member"("p_project_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check admin_users table for intentional admin grants
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE user_id = p_user_id
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rag_get_project_context"("p_project_id" "uuid", "p_limit" integer DEFAULT 200) RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'project_id', p_project_id,
    'tasks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'parent_id', t.parent_task_id, 
        'title', t.title,
        'status', t.status,
        'notes', t.notes,
        'updated_at', t.updated_at
      ) order by t.updated_at desc), '[]'::jsonb)
      from public.tasks t
      where t.root_id = p_project_id 
      limit p_limit
    ),
    'resources', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'task_id', r.task_id,
        'type', r.resource_type,
        'title', r.resource_text, 
        'url', r.resource_url,
        'text', r.resource_text,
        'updated_at', r.created_at 
      ) order by r.created_at desc), '[]'::jsonb)
      from public.task_resources r
      join public.tasks t on r.task_id = t.id
      where t.root_id = p_project_id 
      limit p_limit
    )
  );
$$;


ALTER FUNCTION "public"."rag_get_project_context"("p_project_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_coaching_assignees"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_project_id uuid;
    v_coach_count int;
    v_coach_id uuid;
    v_relevant boolean;
BEGIN
    -- Wave 24: backfill `assignee_id` on coaching tasks when the project's
    -- coach membership transitions to exactly one coach. Complements
    -- `set_coaching_assignee` (the tasks-side trigger from Wave 23).
    -- See docs/db/migrations/2026_04_18_coaching_backfill_on_membership.sql.
    IF TG_OP = 'DELETE' THEN
        v_project_id := OLD.project_id;
        v_relevant := (OLD.role = 'coach');
    ELSIF TG_OP = 'INSERT' THEN
        v_project_id := NEW.project_id;
        v_relevant := (NEW.role = 'coach');
    ELSE
        v_project_id := NEW.project_id;
        v_relevant := (OLD.role IS DISTINCT FROM NEW.role)
                   AND ((OLD.role = 'coach') OR (NEW.role = 'coach'));
        IF OLD.project_id IS DISTINCT FROM NEW.project_id THEN
            v_relevant := TRUE;
        END IF;
    END IF;

    IF NOT v_relevant OR v_project_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COUNT(*), MIN(user_id)
      INTO v_coach_count, v_coach_id
      FROM public.project_members
     WHERE project_id = v_project_id
       AND role = 'coach';

    IF v_coach_count = 1 THEN
        UPDATE public.tasks
           SET assignee_id = v_coach_id
         WHERE root_id = v_project_id
           AND origin = 'instance'
           AND assignee_id IS NULL
           AND (settings ->> 'is_coaching_task')::boolean IS TRUE;
    END IF;

    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."backfill_coaching_assignees"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_coaching_assignee"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_project_id uuid;
    v_coach_count int;
    v_coach_id uuid;
    v_is_coaching boolean;
    v_was_coaching boolean;
BEGIN
    -- Wave 23: auto-assign coaching tasks to the sole project coach.
    -- See docs/db/migrations/2026_04_17_coaching_auto_assign.sql.
    v_is_coaching := (NEW.settings ->> 'is_coaching_task')::boolean IS TRUE;

    IF NOT v_is_coaching THEN
        RETURN NEW;
    END IF;

    -- User intent wins: if the caller supplied an assignee, leave it alone.
    IF NEW.assignee_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        v_was_coaching := (OLD.settings ->> 'is_coaching_task')::boolean IS TRUE;
        IF v_was_coaching AND OLD.assignee_id IS NOT NULL AND NEW.assignee_id IS NOT NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Resolve the project id. `trg_set_coaching_assignee` sorts alphabetically
    -- before `trg_set_root_id_from_parent`, so for a subtask INSERT the caller
    -- frequently leaves `NEW.root_id` null. Walk `parent_task_id` the same way
    -- the root-id resolver does so the coach lookup targets the real project.
    v_project_id := NEW.root_id;
    IF v_project_id IS NULL AND NEW.parent_task_id IS NOT NULL THEN
        SELECT COALESCE(root_id, id)
          INTO v_project_id
          FROM public.tasks
         WHERE id = NEW.parent_task_id;
    END IF;
    IF v_project_id IS NULL THEN
        v_project_id := NEW.id;
    END IF;

    SELECT COUNT(*), MIN(user_id)
      INTO v_coach_count, v_coach_id
      FROM public.project_members
     WHERE project_id = v_project_id
       AND role = 'coach';

    IF v_coach_count = 1 THEN
        NEW.assignee_id := v_coach_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_coaching_assignee"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_root_id_from_parent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."set_root_id_from_parent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_task_type"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Wave 25: keep NEW.task_type in lockstep with the row's depth in the
    -- parent_task_id tree. See docs/db/migrations/2026_04_18_task_type_discriminator.sql.
    NEW.task_type := public.derive_task_type(NEW.parent_task_id);
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_task_type"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_task_completion_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."sync_task_completion_flags"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_task_comments_root_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_root uuid;
BEGIN
  SELECT COALESCE(t.root_id, t.id) INTO v_root
  FROM public.tasks t
  WHERE t.id = NEW.task_id;
  IF v_root IS NULL THEN
    RAISE EXCEPTION 'task_comments: parent task % not found', NEW.task_id;
  END IF;
  NEW.root_id := v_root;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_task_comments_root_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_task_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_project_id uuid;
  v_action     text;
  v_payload    jsonb := '{}'::jsonb;
  v_changed    text[];
BEGIN
  v_project_id := COALESCE(NEW.root_id, OLD.root_id, NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    v_action  := 'created';
    v_payload := jsonb_build_object(
      'title', NEW.title,
      'parent_task_id', NEW.parent_task_id,
      'status', NEW.status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action  := 'status_changed';
      v_payload := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    ELSE
      v_action := 'updated';
      v_changed := ARRAY[]::text[];
      IF NEW.title       IS DISTINCT FROM OLD.title       THEN v_changed := array_append(v_changed, 'title'); END IF;
      IF NEW.description IS DISTINCT FROM OLD.description THEN v_changed := array_append(v_changed, 'description'); END IF;
      IF NEW.start_date  IS DISTINCT FROM OLD.start_date  THEN v_changed := array_append(v_changed, 'start_date'); END IF;
      IF NEW.due_date    IS DISTINCT FROM OLD.due_date    THEN v_changed := array_append(v_changed, 'due_date'); END IF;
      IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN v_changed := array_append(v_changed, 'assignee_id'); END IF;
      IF array_length(v_changed, 1) IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      END IF;
      v_payload := jsonb_build_object('changed_keys', v_changed);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'deleted';
    v_payload := jsonb_build_object('title', OLD.title);
  END IF;

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_project_id, auth.uid(), 'task', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_task_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_comment_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_action  text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'comment_posted';
    v_payload := jsonb_build_object('task_id', NEW.task_id, 'body_preview', substring(NEW.body, 1, 140));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action  := 'comment_deleted';
      v_payload := jsonb_build_object('task_id', NEW.task_id);
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
      v_action  := 'comment_edited';
      v_payload := jsonb_build_object('task_id', NEW.task_id, 'body_preview', substring(NEW.body, 1, 140));
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'comment_deleted';
    v_payload := jsonb_build_object('task_id', OLD.task_id);
  END IF;

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (COALESCE(NEW.root_id, OLD.root_id), auth.uid(), 'comment', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_comment_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_member_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_action  text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'member_added';
    v_payload := jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role);
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    v_action  := 'member_role_changed';
    v_payload := jsonb_build_object('user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role);
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'member_removed';
    v_payload := jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (COALESCE(NEW.project_id, OLD.project_id), auth.uid(), 'member', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_member_change"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"(),
    "granted_by" "text"
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."people" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "role" "text" DEFAULT 'Volunteer'::"text",
    "status" "text" DEFAULT 'New'::"text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "people_status_check" CHECK (("status" = ANY (ARRAY['New'::"text", 'Contacted'::"text", 'Meeting Scheduled'::"text", 'Joined'::"text", 'Not Interested'::"text"])))
);


ALTER TABLE "public"."people" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    CONSTRAINT "project_invites_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"])))
);


ALTER TABLE "public"."project_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'viewer'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "project_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"])))
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rag_chunks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "resource_id" "uuid",
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "embedding" "public"."vector"(1536),
    "fts" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "content")) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."rag_chunks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "from_task_id" "uuid",
    "to_task_id" "uuid",
    "type" "text" DEFAULT 'relates_to'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "task_relationships_type_check" CHECK (("type" = ANY (ARRAY['blocks'::"text", 'relates_to'::"text", 'duplicates'::"text"])))
);


ALTER TABLE "public"."task_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "resource_type" "public"."task_resource_type" NOT NULL,
    "resource_url" "text",
    "resource_text" "text",
    "storage_bucket" "text",
    "storage_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "task_resources_type_payload_check" CHECK (((("resource_type" = 'url'::"public"."task_resource_type") AND ("resource_url" IS NOT NULL) AND ("resource_text" IS NULL) AND ("storage_path" IS NULL)) OR (("resource_type" = 'text'::"public"."task_resource_type") AND ("resource_text" IS NOT NULL) AND ("resource_url" IS NULL) AND ("storage_path" IS NULL)) OR (("resource_type" = 'pdf'::"public"."task_resource_type") AND ("storage_path" IS NOT NULL) AND ("resource_url" IS NULL) AND ("resource_text" IS NULL))))
);


ALTER TABLE "public"."task_resources" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_task_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'todo'::"text",
    "origin" "text" DEFAULT 'instance'::"text",
    "creator" "uuid",
    "root_id" "uuid",
    "notes" "text",
    "days_from_start" integer DEFAULT 0,
    "start_date" timestamp with time zone,
    "due_date" timestamp with time zone,
    "position" bigint DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "purpose" "text",
    "actions" "text",
    "is_complete" boolean DEFAULT false,
    "primary_resource_id" "uuid",
    "is_locked" boolean DEFAULT false,
    "prerequisite_phase_id" "uuid",
    "parent_project_id" "uuid",
    "project_type" "text" DEFAULT 'primary'::"text",
    "assignee_id" "uuid",
    "is_premium" boolean DEFAULT false,
    "location" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "supervisor_email" "text",
    "task_type" "text",
    "template_version" integer DEFAULT 1 NOT NULL,
    "cloned_from_task_id" "uuid",
    CONSTRAINT "tasks_project_kind_check" CHECK ((("parent_task_id" IS NOT NULL) OR (("settings" ->> 'project_kind'::"text") IS NULL) OR (("settings" ->> 'project_kind'::"text") = ANY (ARRAY['date'::"text", 'checkpoint'::"text"])))),
    CONSTRAINT "tasks_project_type_check" CHECK (("project_type" = ANY (ARRAY['primary'::"text", 'secondary'::"text"]))),
    CONSTRAINT "tasks_root_id_required_for_children" CHECK ((("parent_task_id" IS NULL) OR ("root_id" IS NOT NULL))),
    CONSTRAINT "tasks_task_type_check" CHECK ((("task_type" IS NULL) OR ("task_type" = ANY (ARRAY['project'::"text", 'phase'::"text", 'milestone'::"text", 'task'::"text", 'subtask'::"text"]))))
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."tasks" IS 'Tasks table. Resources are now in task_resources table.';



COMMENT ON COLUMN "public"."tasks"."settings" IS 'Project-level settings (e.g., due_soon_threshold, location_defaults)';



COMMENT ON COLUMN "public"."tasks"."supervisor_email" IS 'Optional supervisor recipient for monthly Project Status Reports. Only meaningful on project roots (parent_task_id IS NULL). UI gates the field to roots; no DB-level check constraint.';


COMMENT ON TABLE "public"."admin_users" IS 'SECURITY DEFINER-only access. RLS is intentionally enabled with zero policies - reads happen via public.is_admin(uid) and the public.admin_* SECURITY DEFINER RPCs. Direct SELECT/INSERT/UPDATE/DELETE by authenticated or anon roles is denied by design.';


COMMENT ON COLUMN "public"."tasks"."template_version" IS 'Wave 36 — monotonic version on template rows (origin = ''template''). Bumped by trg_bump_template_version on text/structural edits. Cloned instance roots stamp settings.cloned_from_template_version at clone time for traceability; edits to the source template do NOT propagate to existing instances (intentional).';



COMMENT ON COLUMN "public"."tasks"."cloned_from_task_id" IS 'Wave 36 — stamped during clone_project_template for every cloned descendant. Points to the source template task. NULL on pre-Wave-36 rows and on post-instantiation additions. App-layer UI guard in TaskDetailsView warns non-owners before deleting a template-origin task; owners can delete freely.';


CREATE TABLE IF NOT EXISTS "public"."task_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "root_id" "uuid" NOT NULL,
    "parent_comment_id" "uuid",
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "mentions" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "task_comments_body_check" CHECK (("length"("trim"("body")) BETWEEN 1 AND 10000))
);


ALTER TABLE "public"."task_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "actor_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_log_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['task'::"text", 'comment'::"text", 'member'::"text", 'project'::"text"]))),
    CONSTRAINT "activity_log_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'deleted'::"text", 'status_changed'::"text", 'member_added'::"text", 'member_removed'::"text", 'member_role_changed'::"text", 'comment_posted'::"text", 'comment_edited'::"text", 'comment_deleted'::"text", 'task_completed'::"text", 'admin_granted'::"text", 'admin_revoked'::"text", 'user_suspended'::"text", 'user_unsuspended'::"text", 'password_reset_requested'::"text"])))
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


COMMENT ON COLUMN "public"."activity_log"."project_id" IS 'NULL for cross-project / platform-level admin actions (admin role toggle, user moderation). Otherwise references the project the row belongs to.';


CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "user_id" "uuid" NOT NULL,
    "email_mentions" boolean DEFAULT true NOT NULL,
    "email_overdue_digest" "text" DEFAULT 'daily'::"text" NOT NULL,
    "email_assignment" boolean DEFAULT true NOT NULL,
    "push_mentions" boolean DEFAULT true NOT NULL,
    "push_overdue" boolean DEFAULT true NOT NULL,
    "push_assignment" boolean DEFAULT false NOT NULL,
    "quiet_hours_start" time without time zone,
    "quiet_hours_end" time without time zone,
    "timezone" "text" DEFAULT 'UTC'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "notification_preferences_email_overdue_digest_check" CHECK (("email_overdue_digest" = ANY (ARRAY['off'::"text", 'daily'::"text", 'weekly'::"text"])))
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "channel" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_id" "text",
    "error" "text",
    CONSTRAINT "notification_log_channel_check" CHECK (("channel" = ANY (ARRAY['email'::"text", 'push'::"text"])))
);


ALTER TABLE "public"."notification_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ics_feed_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "label" "text",
    "project_filter" "uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    "last_accessed_at" timestamp with time zone
);


ALTER TABLE "public"."ics_feed_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."ics_feed_tokens" IS 'Wave 35 — per-user ICS calendar feed tokens. The token value IS the credential used by the public /functions/v1/ics-feed edge function. Revocation is soft (revoked_at) so past accesses stay auditable via last_accessed_at.';


-- Wave 30: Bootstrap a notification_preferences row for every auth.users INSERT.
CREATE OR REPLACE FUNCTION "public"."bootstrap_notification_prefs"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bootstrap_notification_prefs"() OWNER TO "postgres";


-- Wave 30 Task 3: resolve @-handles to auth.users ids. Called client-side from
-- CommentComposer before persisting task_comments.mentions as uuids.
CREATE OR REPLACE FUNCTION "public"."resolve_user_handles"("p_handles" "text"[])
    RETURNS TABLE("handle" "text", "user_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT h, u.id
  FROM unnest(p_handles) AS h
  LEFT JOIN auth.users u
    ON lower(u.email) LIKE lower(h) || '@%'
    OR lower(u.raw_user_meta_data ->> 'username') = lower(h);
END;
$$;


ALTER FUNCTION "public"."resolve_user_handles"("p_handles" "text"[]) OWNER TO "postgres";


-- Wave 30 Task 3: AFTER INSERT on task_comments → enqueue a mention_pending
-- notification_log row per resolved uuid in NEW.mentions (skips author).
CREATE OR REPLACE FUNCTION "public"."enqueue_comment_mentions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT t::uuid
    FROM unnest(NEW.mentions) AS t
    WHERE t IS NOT NULL
      AND t ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND t::uuid <> NEW.author_id
  LOOP
    INSERT INTO public.notification_log (user_id, channel, event_type, payload)
    VALUES (
      v_user_id,
      'email',
      'mention_pending',
      jsonb_build_object(
        'comment_id', NEW.id,
        'task_id', NEW.task_id,
        'root_id', NEW.root_id,
        'author_id', NEW.author_id,
        'body_preview', substring(NEW.body, 1, 140)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enqueue_comment_mentions"() OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tasks_with_primary_resource" AS
 SELECT "t"."id",
    "t"."parent_task_id",
    "t"."title",
    "t"."description",
    "t"."status",
    "t"."origin",
    "t"."creator",
    "t"."root_id",
    "t"."notes",
    "t"."days_from_start",
    "t"."start_date",
    "t"."due_date",
    "t"."position",
    "t"."created_at",
    "t"."updated_at",
    "t"."purpose",
    "t"."actions",
    "t"."is_complete",
    "t"."primary_resource_id",
    "t"."is_locked",
    "t"."prerequisite_phase_id",
    "t"."parent_project_id",
    "t"."project_type",
    "t"."assignee_id",
    "t"."is_premium",
    "t"."location",
    "t"."priority",
    "t"."settings",
    "t"."supervisor_email",
    "t"."task_type",
    "t"."template_version",
    "t"."cloned_from_task_id",
    "r"."id" AS "resource_id",
    ("r"."resource_type")::"text" AS "resource_type",
    "r"."resource_url",
    "r"."resource_text",
    "r"."storage_path",
    NULL::"text" AS "resource_name"
   FROM ("public"."tasks" "t"
     LEFT JOIN "public"."task_resources" "r" ON (("r"."id" = "t"."primary_resource_id")));


ALTER TABLE "public"."tasks_with_primary_resource" OWNER TO "postgres";


ALTER VIEW "public"."tasks_with_primary_resource" SET ("security_invoker"='true');


CREATE OR REPLACE VIEW "public"."view_master_library" AS
 SELECT "t"."id",
    "t"."parent_task_id",
    "t"."title",
    "t"."description",
    "t"."status",
    "t"."origin",
    "t"."creator",
    "t"."root_id",
    "t"."notes",
    "t"."days_from_start",
    "t"."start_date",
    "t"."due_date",
    "t"."position",
    "t"."created_at",
    "t"."updated_at",
    "t"."purpose",
    "t"."actions",
    "t"."is_complete",
    "t"."primary_resource_id",
    "t"."primary_resource_id" AS "resource_id"
   FROM "public"."tasks" "t"
  WHERE ("t"."origin" = 'template'::"text");


ALTER TABLE "public"."view_master_library" OWNER TO "postgres";

ALTER VIEW "public"."view_master_library" SET ("security_invoker"='true');


CREATE OR REPLACE VIEW "public"."users_public" WITH ("security_invoker"='true') AS
 SELECT "u"."id",
    "u"."email"
   FROM "auth"."users" "u";


ALTER TABLE "public"."users_public" OWNER TO "postgres";


COMMENT ON VIEW "public"."users_public" IS 'Service-role-only projection of auth.users for edge functions that need recipient email addresses without exposing auth.users through the public API.';


ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_user_id_key" UNIQUE ("project_id", "user_id");



ALTER TABLE ONLY "public"."rag_chunks"
    ADD CONSTRAINT "rag_chunks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_relationships"
    ADD CONSTRAINT "task_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_resources"
    ADD CONSTRAINT "task_resources_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "unique_invite_per_project" UNIQUE ("project_id", "email");



ALTER TABLE ONLY "public"."task_relationships"
    ADD CONSTRAINT "unique_relationship" UNIQUE ("from_task_id", "to_task_id", "type");



CREATE INDEX "idx_members_project" ON "public"."project_members" USING "btree" ("project_id");



CREATE INDEX "idx_members_user" ON "public"."project_members" USING "btree" ("user_id");



CREATE INDEX "idx_people_project_id" ON "public"."people" USING "btree" ("project_id");



CREATE INDEX "idx_task_resources_task_id" ON "public"."task_resources" USING "btree" ("task_id");



CREATE INDEX "idx_task_relationships_project_id" ON "public"."task_relationships" USING "btree" ("project_id");



CREATE INDEX "idx_task_relationships_to_task_id" ON "public"."task_relationships" USING "btree" ("to_task_id");



CREATE INDEX "idx_tasks_assignee_id" ON "public"."tasks" USING "btree" ("assignee_id");


CREATE INDEX "idx_tasks_cloned_from_task_id" ON "public"."tasks" USING "btree" ("cloned_from_task_id") WHERE ("cloned_from_task_id" IS NOT NULL);



CREATE INDEX "idx_tasks_creator" ON "public"."tasks" USING "btree" ("creator");



CREATE INDEX "idx_tasks_creator_origin_parent_position" ON "public"."tasks" USING "btree" ("creator", "origin", "parent_task_id", "position");



CREATE INDEX "idx_tasks_is_complete" ON "public"."tasks" USING "btree" ("is_complete");



CREATE INDEX "idx_tasks_is_locked" ON "public"."tasks" USING "btree" ("is_locked");



CREATE INDEX "idx_tasks_is_premium" ON "public"."tasks" USING "btree" ("is_premium");



CREATE INDEX "idx_tasks_parent_project_id" ON "public"."tasks" USING "btree" ("parent_project_id") WHERE ("parent_project_id" IS NOT NULL);



CREATE INDEX "idx_tasks_parent_id" ON "public"."tasks" USING "btree" ("parent_task_id");



CREATE INDEX "idx_tasks_primary_resource_id" ON "public"."tasks" USING "btree" ("primary_resource_id") WHERE ("primary_resource_id" IS NOT NULL);



CREATE INDEX "idx_tasks_prerequisite_phase_id" ON "public"."tasks" USING "btree" ("prerequisite_phase_id") WHERE ("prerequisite_phase_id" IS NOT NULL);



CREATE INDEX "idx_tasks_root_id" ON "public"."tasks" USING "btree" ("root_id");



CREATE INDEX "idx_tasks_task_type" ON "public"."tasks" USING "btree" ("task_type");



CREATE INDEX "rag_chunks_fts_idx" ON "public"."rag_chunks" USING "gin" ("fts");



CREATE INDEX "rag_chunks_project_id_idx" ON "public"."rag_chunks" USING "btree" ("project_id");



CREATE INDEX "rag_chunks_resource_id_idx" ON "public"."rag_chunks" USING "btree" ("resource_id");



CREATE INDEX "rag_chunks_task_id_idx" ON "public"."rag_chunks" USING "btree" ("task_id");



CREATE INDEX "task_resources_type_idx" ON "public"."task_resources" USING "btree" ("resource_type");



CREATE INDEX "idx_task_comments_task_id" ON "public"."task_comments" USING "btree" ("task_id", "created_at" DESC);



CREATE INDEX "idx_task_comments_root_id" ON "public"."task_comments" USING "btree" ("root_id", "created_at" DESC);



CREATE INDEX "idx_task_comments_parent_comment_id" ON "public"."task_comments" USING "btree" ("parent_comment_id") WHERE ("parent_comment_id" IS NOT NULL);


CREATE INDEX "idx_task_comments_author_id" ON "public"."task_comments" USING "btree" ("author_id");



CREATE INDEX "idx_activity_log_project_id" ON "public"."activity_log" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_activity_log_entity" ON "public"."activity_log" USING "btree" ("entity_type", "entity_id", "created_at" DESC);


CREATE INDEX "idx_activity_log_actor_id" ON "public"."activity_log" USING "btree" ("actor_id") WHERE ("actor_id" IS NOT NULL);



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."ics_feed_tokens"
    ADD CONSTRAINT "ics_feed_tokens_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."ics_feed_tokens"
    ADD CONSTRAINT "ics_feed_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_log"
    ADD CONSTRAINT "notification_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."ics_feed_tokens"
    ADD CONSTRAINT "ics_feed_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE INDEX "idx_notification_log_user_id_sent_at" ON "public"."notification_log" USING "btree" ("user_id", "sent_at" DESC);


CREATE INDEX "idx_ics_feed_tokens_token" ON "public"."ics_feed_tokens" USING "btree" ("token");


CREATE INDEX "idx_ics_feed_tokens_user" ON "public"."ics_feed_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_notification_log_event_type" ON "public"."notification_log" USING "btree" ("event_type", "sent_at" DESC);


CREATE INDEX "idx_notification_log_pending" ON "public"."notification_log" USING "btree" ("id") WHERE ("event_type" = 'mention_pending'::"text");



CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "trg_notification_preferences_handle_updated_at" BEFORE UPDATE ON "public"."notification_preferences" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_bootstrap_notification_prefs" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."bootstrap_notification_prefs"();



CREATE OR REPLACE TRIGGER "trg_people_updated_at" BEFORE UPDATE ON "public"."people" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_backfill_coaching_assignees" AFTER INSERT OR UPDATE OR DELETE ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."backfill_coaching_assignees"();



CREATE OR REPLACE TRIGGER "trg_set_coaching_assignee" BEFORE INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_coaching_assignee"();


CREATE OR REPLACE TRIGGER "trg_bump_template_version" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."bump_template_version"();



CREATE OR REPLACE TRIGGER "trg_set_root_id_from_parent" BEFORE INSERT OR UPDATE OF "parent_task_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_root_id_from_parent"();



CREATE OR REPLACE TRIGGER "trg_set_task_type" BEFORE INSERT OR UPDATE OF "parent_task_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_task_type"();



CREATE OR REPLACE TRIGGER "trg_sync_task_completion" BEFORE INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_task_completion_flags"();



CREATE OR REPLACE TRIGGER "trg_tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_unlock_next_phase" AFTER UPDATE OF "status" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."handle_phase_completion"();



CREATE OR REPLACE TRIGGER "trigger_calc_task_dates" AFTER INSERT OR DELETE OR UPDATE OF "start_date", "due_date", "parent_task_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."calc_task_date_rollup"();



CREATE OR REPLACE TRIGGER "trigger_phase_unlock" AFTER UPDATE OF "is_complete" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."check_phase_unlock"();



CREATE OR REPLACE TRIGGER "trigger_tasks_set_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_task_comments_set_root_id" BEFORE INSERT ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."set_task_comments_root_id"();



CREATE OR REPLACE TRIGGER "trg_task_comments_handle_updated_at" BEFORE UPDATE ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "trg_log_task_change" AFTER INSERT OR UPDATE OR DELETE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."log_task_change"();



CREATE OR REPLACE TRIGGER "trg_log_comment_change" AFTER INSERT OR UPDATE OR DELETE ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."log_comment_change"();



CREATE OR REPLACE TRIGGER "trg_enqueue_comment_mentions" AFTER INSERT ON "public"."task_comments" FOR EACH ROW EXECUTE FUNCTION "public"."enqueue_comment_mentions"();



CREATE OR REPLACE TRIGGER "trg_log_member_change" AFTER INSERT OR UPDATE OR DELETE ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."log_member_change"();



ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."people"
    ADD CONSTRAINT "people_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_invites"
    ADD CONSTRAINT "project_invites_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rag_chunks"
    ADD CONSTRAINT "rag_chunks_resource_id_fkey" FOREIGN KEY ("resource_id") REFERENCES "public"."task_resources"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rag_chunks"
    ADD CONSTRAINT "rag_chunks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_relationships"
    ADD CONSTRAINT "task_relationships_from_task_id_fkey" FOREIGN KEY ("from_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_relationships"
    ADD CONSTRAINT "task_relationships_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_relationships"
    ADD CONSTRAINT "task_relationships_to_task_id_fkey" FOREIGN KEY ("to_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_resources"
    ADD CONSTRAINT "task_resources_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_comments"
    ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id");


ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_cloned_from_task_id_fkey" FOREIGN KEY ("cloned_from_task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_creator_fkey" FOREIGN KEY ("creator") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_parent_project_id_fkey" FOREIGN KEY ("parent_project_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_prerequisite_phase_id_fkey" FOREIGN KEY ("prerequisite_phase_id") REFERENCES "public"."tasks"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_primary_resource_id_fkey" FOREIGN KEY ("primary_resource_id") REFERENCES "public"."task_resources"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "public"."tasks"("id") ON DELETE CASCADE;



CREATE POLICY "Allow project creation" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (((("root_id" IS NULL) OR ("root_id" = "id")) AND ("parent_task_id" IS NULL) AND ("creator" = (SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Allow subtask creation by members" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK ((("root_id" IS NOT NULL) AND "public"."has_project_role"("root_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"])));



CREATE POLICY "Create invites for project members" ON "public"."project_invites" FOR INSERT WITH CHECK (("public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text"]) OR ("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['editor'::"text"]) AND ("role" <> 'owner'::"text"))));



CREATE POLICY "Delete invites for project members" ON "public"."project_invites" FOR DELETE USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Enable delete for users" ON "public"."tasks" FOR DELETE USING ((("creator" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"(COALESCE("root_id", "id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"])));



CREATE POLICY "Enable insert for authenticated users within project" ON "public"."tasks" FOR INSERT WITH CHECK ((((("auth"."role"() = 'authenticated'::"text") AND ("root_id" IS NULL) AND ("parent_task_id" IS NULL) AND ("creator" = (SELECT (auth.jwt() ->> 'sub')::uuid))) OR "public"."has_project_role"("root_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"])) AND (("origin" IS DISTINCT FROM 'template'::"text") OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid)))));



CREATE POLICY "Enable read access for all users" ON "public"."tasks" FOR SELECT USING ((("creator" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"(COALESCE("root_id", "id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"]) OR ("origin" = 'template'::"text") OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Enable update for users" ON "public"."tasks" FOR UPDATE USING (((("creator" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"(COALESCE("root_id", "id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"])) AND (("origin" IS DISTINCT FROM 'template'::"text") OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid)))));



CREATE POLICY "Enable update for coaches on coaching tasks" ON "public"."tasks" FOR UPDATE USING (("public"."has_project_role"(COALESCE("root_id", "id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['coach'::"text"]) AND ((("settings" ->> 'is_coaching_task'))::boolean IS TRUE) AND ("origin" IS DISTINCT FROM 'template'::"text")));



CREATE POLICY "Enable update for phase leads" ON "public"."tasks" FOR UPDATE TO "authenticated" USING ((("origin" = 'instance'::"text") AND "public"."user_is_phase_lead"("id", (SELECT (auth.jwt() ->> 'sub')::uuid)))) WITH CHECK ((("origin" = 'instance'::"text") AND "public"."user_is_phase_lead"("id", (SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Manage people for owners and editors" ON "public"."people" USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Manage relationships" ON "public"."task_relationships" USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Manage resources" ON "public"."task_resources" USING (((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_resources"."task_id") AND (("t"."creator" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"(COALESCE("t"."root_id", "t"."id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"]))))) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "Project members can delete chunks" ON "public"."rag_chunks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "rag_chunks"."project_id") AND ("project_members"."user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid))))));



CREATE POLICY "Project members can insert chunks" ON "public"."rag_chunks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "rag_chunks"."project_id") AND ("project_members"."user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid))))));



CREATE POLICY "Project members can read chunks" ON "public"."rag_chunks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "rag_chunks"."project_id") AND ("project_members"."user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid))))));



CREATE POLICY "Project members can update chunks" ON "public"."rag_chunks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."project_members"
  WHERE (("project_members"."project_id" = "rag_chunks"."project_id") AND ("project_members"."user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid))))));



CREATE POLICY "Public Read Templates" ON "public"."tasks" FOR SELECT TO "authenticated" USING (("origin" = 'template'::"text"));



CREATE POLICY "View invites for project members" ON "public"."project_invites" FOR SELECT USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "View people for project members" ON "public"."people" FOR SELECT USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "View project members" ON "public"."project_members" FOR SELECT USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "View relationships" ON "public"."task_relationships" FOR SELECT USING (("public"."has_project_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"]) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



CREATE POLICY "View resources" ON "public"."task_resources" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."tasks" "t"
  WHERE (("t"."id" = "task_resources"."task_id") AND (("t"."creator" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."has_project_role"(COALESCE("t"."root_id", "t"."id"), (SELECT (auth.jwt() ->> 'sub')::uuid), ARRAY['owner'::"text", 'editor'::"text", 'coach'::"text", 'viewer'::"text", 'limited'::"text"]))))) OR "public"."is_admin"((SELECT (auth.jwt() ->> 'sub')::uuid))));



ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;


-- Wave 24: rewritten from the Wave 23 audit. Ownership is now checked via
-- `check_project_ownership_by_role` (queries project_members.role = 'owner')
-- rather than the deprecated shim that checked tasks.creator. A user who was
-- removed from project_members no longer passes.
CREATE POLICY "members_delete_policy" ON "public"."project_members" FOR DELETE USING ((("user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."check_project_ownership_by_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid))));



-- Wave 24: bootstrap path — the project creator self-inserts the first
-- owner row before any owner-role row exists. Switched from the deprecated
-- `check_project_ownership` shim to the correctly-named
-- `check_project_creatorship` directly. The "already-owner" branch is
-- preserved for subsequent member additions.
CREATE POLICY "members_insert_policy" ON "public"."project_members" FOR INSERT WITH CHECK (("public"."check_project_creatorship"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid)) OR ("project_id" IN ( SELECT "project_members_1"."project_id"
   FROM "public"."project_members" "project_members_1"
  WHERE (("project_members_1"."user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid)) AND ("project_members_1"."role" = 'owner'::"text"))))));



-- Wave 24: creatorship branch dropped (redundant + leaky). is_active_member
-- + the user_id self-check cover every legitimate read; the old creatorship
-- branch only fired for *removed* creators.
CREATE POLICY "members_select_policy" ON "public"."project_members" FOR SELECT USING ((("user_id" = (SELECT (auth.jwt() ->> 'sub')::uuid)) OR "public"."is_active_member"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid))));



-- Wave 24: ownership rewrite, same rationale as members_delete_policy. The
-- WITH CHECK is preserved verbatim from Wave 23 (prevents a user from
-- self-demoting to viewer).
CREATE POLICY "members_update_policy" ON "public"."project_members" FOR UPDATE USING (("public"."check_project_ownership_by_role"("project_id", (SELECT (auth.jwt() ->> 'sub')::uuid)))) WITH CHECK ((("user_id" <> (SELECT (auth.jwt() ->> 'sub')::uuid)) OR ("role" <> 'viewer'::"text")));



ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rag_chunks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_resources" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Activity log select by project members" ON "public"."activity_log" FOR SELECT TO "authenticated" USING (("public"."is_active_member"("project_id", "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));


ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ics_feed_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Users can view their own ICS tokens" ON "public"."ics_feed_tokens" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));


CREATE POLICY "Users can create their own ICS tokens" ON "public"."ics_feed_tokens" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "Users can update their own ICS tokens" ON "public"."ics_feed_tokens" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "Users can delete their own ICS tokens" ON "public"."ics_feed_tokens" FOR DELETE TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));


CREATE POLICY "Notif prefs: select own" ON "public"."notification_preferences" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "Notif prefs: insert own" ON "public"."notification_preferences" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "Notif prefs: update own" ON "public"."notification_preferences" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "Notif log: select own or admin" ON "public"."notification_log" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Push subs: select own" ON "public"."push_subscriptions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "Push subs: insert own" ON "public"."push_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


CREATE POLICY "Push subs: delete own" ON "public"."push_subscriptions" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


CREATE POLICY "Comments select by project members" ON "public"."task_comments" FOR SELECT TO "authenticated" USING (("public"."is_active_member"("root_id", "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));


CREATE POLICY "Comments insert by project members" ON "public"."task_comments" FOR INSERT TO "authenticated" WITH CHECK ((("author_id" = "auth"."uid"()) AND ("public"."is_active_member"("root_id", "auth"."uid"()) OR "public"."is_admin"("auth"."uid"()))));


CREATE POLICY "Comments update by author" ON "public"."task_comments" FOR UPDATE TO "authenticated" USING (((("author_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)) OR "public"."is_admin"("auth"."uid"()))) WITH CHECK ((("task_id" = (SELECT "task_comments_1"."task_id" FROM "public"."task_comments" "task_comments_1" WHERE ("task_comments_1"."id" = "task_comments"."id"))) AND ("root_id" = (SELECT "task_comments_1"."root_id" FROM "public"."task_comments" "task_comments_1" WHERE ("task_comments_1"."id" = "task_comments"."id"))) AND ("parent_comment_id" IS NOT DISTINCT FROM (SELECT "task_comments_1"."parent_comment_id" FROM "public"."task_comments" "task_comments_1" WHERE ("task_comments_1"."id" = "task_comments"."id"))) AND ("author_id" = (SELECT "task_comments_1"."author_id" FROM "public"."task_comments" "task_comments_1" WHERE ("task_comments_1"."id" = "task_comments"."id")))));


CREATE POLICY "Comments delete by author or owner" ON "public"."task_comments" FOR DELETE TO "authenticated" USING ((("author_id" = "auth"."uid"()) OR "public"."check_project_ownership_by_role"("root_id", "auth"."uid"()) OR "public"."is_admin"("auth"."uid"())));




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."task_comments";






REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


































































































































































REVOKE ALL ON FUNCTION "public"."check_project_creatorship"("p_id" "uuid", "u_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_project_creatorship"("p_id" "uuid", "u_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."check_project_ownership_by_role"("p_id" "uuid", "u_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_project_ownership_by_role"("p_id" "uuid", "u_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."derive_task_type"("p_parent_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."derive_task_type"("p_parent_task_id" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."user_is_phase_lead"("target_task_id" "uuid", "uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_is_phase_lead"("target_task_id" "uuid", "uid" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."bootstrap_notification_prefs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bootstrap_notification_prefs"() TO "authenticated";



GRANT ALL ON FUNCTION "public"."clone_project_template"("p_template_id" "uuid", "p_new_parent_id" "uuid", "p_new_origin" "text", "p_user_id" "uuid", "p_title" "text", "p_description" "text", "p_start_date" timestamp with time zone, "p_due_date" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clone_project_template"("p_template_id" "uuid", "p_new_parent_id" "uuid", "p_new_origin" "text", "p_user_id" "uuid", "p_title" "text", "p_description" "text", "p_start_date" timestamp with time zone, "p_due_date" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_details"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_task_root_id"("p_task_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_task_root_id"("p_task_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."has_permission"("p_project_id" "uuid", "p_user_id" "uuid", "p_required_role" "text") FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."initialize_default_project"("p_project_id" "uuid", "p_creator_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_default_project"("p_project_id" "uuid", "p_creator_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_project"("p_project_id" "uuid", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_project"("p_project_id" "uuid", "p_email" "text", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_active_member"("p_project_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_active_member"("p_project_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_active_member"("p_project_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."admin_search_users"("p_query" "text", "p_max_results" integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_search_users"("p_query" "text", "p_max_results" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_user_detail"("p_uid" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_user_detail"("p_uid" "uuid") TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_recent_activity"("p_limit" integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_recent_activity"("p_limit" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_list_users"("filter" "jsonb", "p_limit" integer, "p_offset" integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_list_users"("filter" "jsonb", "p_limit" integer, "p_offset" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_analytics_snapshot"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_analytics_snapshot"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_set_user_admin_role"("p_target_uid" "uuid", "p_make_admin" boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_set_user_admin_role"("p_target_uid" "uuid", "p_make_admin" boolean) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_search_root_tasks"("p_query" "text", "p_origin" "text", "p_max_results" integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_search_root_tasks"("p_query" "text", "p_origin" "text", "p_max_results" integer) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_template_roots"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_template_roots"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."admin_template_clones"("p_template_id" "uuid") FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."admin_template_clones"("p_template_id" "uuid") TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_task_comments_root_id"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."set_task_comments_root_id"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."log_task_change"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."log_task_change"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."log_comment_change"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."log_comment_change"() TO "authenticated";
REVOKE ALL ON FUNCTION "public"."log_member_change"() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."log_member_change"() TO "authenticated";



























GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."project_members" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."task_resources" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."task_resources" TO "authenticated";


GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ics_feed_tokens" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ics_feed_tokens" TO "service_role";



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tasks" TO "authenticated";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."tasks" TO "service_role";



GRANT SELECT ON TABLE "public"."tasks_with_primary_resource" TO "authenticated";
GRANT SELECT ON TABLE "public"."tasks_with_primary_resource" TO "service_role";



GRANT SELECT ON TABLE "public"."view_master_library" TO "authenticated";
GRANT SELECT ON TABLE "public"."view_master_library" TO "service_role";


GRANT SELECT ON TABLE "public"."users_public" TO "service_role";




