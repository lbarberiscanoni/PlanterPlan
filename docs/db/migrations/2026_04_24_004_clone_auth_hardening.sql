-- Wave 36 follow-up hardening
--
-- * `has_permission` is an internal SECURITY DEFINER helper; bind arbitrary
--   user-id checks to the authenticated caller and remove public RPC access.
-- * `clone_project_template` authorizes visible template sources via the same
--   published/creator/admin shape used by the library reads, then checks the
--   destination project separately before cloning under an existing parent.

CREATE OR REPLACE FUNCTION public.has_permission(
    p_project_id uuid,
    p_user_id uuid,
    p_required_role text DEFAULT 'member'
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
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

    SELECT role INTO v_role
    FROM public.project_members
    WHERE project_id = p_project_id AND user_id = p_user_id;

    IF v_role IS NULL THEN
        RETURN false;
    END IF;

    IF p_required_role = 'member' THEN
        RETURN true;
    END IF;

    RETURN v_role = p_required_role OR v_role = 'owner';
END;
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.clone_project_template(
    p_template_id uuid,
    p_new_parent_id uuid,
    p_new_origin text,
    p_user_id uuid,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_start_date timestamp with time zone DEFAULT NULL,
    p_due_date timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

    IF p_start_date IS NOT NULL AND v_old_start_date IS NOT NULL THEN
        v_interval := (p_start_date::date - v_old_start_date::date) * '1 day'::interval;
    ELSE
        v_interval := '0 days'::interval;
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS temp_task_map (
        old_id uuid PRIMARY KEY,
        new_id uuid
    ) ON COMMIT DROP;

    CREATE TEMP TABLE IF NOT EXISTS temp_res_map (
        old_id uuid PRIMARY KEY,
        new_id uuid
    ) ON COMMIT DROP;

    WITH RECURSIVE subtree AS (
        SELECT id FROM public.tasks WHERE id = p_template_id
        UNION ALL
        SELECT t.id FROM public.tasks t JOIN subtree s ON t.parent_task_id = s.id
    )
    INSERT INTO temp_task_map (old_id, new_id)
    SELECT id, gen_random_uuid() FROM subtree;

    SELECT new_id INTO v_top_new_id FROM temp_task_map WHERE old_id = p_template_id;

    IF p_new_parent_id IS NULL THEN
        v_new_root_id := v_top_new_id;
    ELSE
        SELECT COALESCE(root_id, id) INTO v_new_root_id
        FROM public.tasks
        WHERE id = p_new_parent_id;

        IF v_new_root_id IS NULL THEN
            RAISE EXCEPTION 'Parent task % has no root_id', p_new_parent_id;
        END IF;

        IF NOT public.is_admin(v_actor_id)
            AND NOT public.has_project_role(v_new_root_id, v_actor_id, ARRAY['owner', 'editor'])
        THEN
            RAISE EXCEPTION 'Access denied: You do not have permission to modify the destination project.';
        END IF;
    END IF;

    INSERT INTO public.tasks (
        id, parent_task_id, root_id, creator, origin,
        title, description, status, position,
        notes, purpose, actions, is_complete, days_from_start, start_date, due_date,
        cloned_from_task_id
    )
    SELECT
        m.new_id,
        CASE
            WHEN t.id = p_template_id THEN p_new_parent_id
            ELSE mp.new_id
        END,
        v_new_root_id,
        v_actor_id,
        p_new_origin,
        CASE WHEN t.id = p_template_id AND p_title IS NOT NULL THEN p_title ELSE t.title END,
        CASE WHEN t.id = p_template_id AND p_description IS NOT NULL THEN p_description ELSE t.description END,
        t.status, t.position,
        t.notes, t.purpose, t.actions, false, t.days_from_start,
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

    INSERT INTO temp_res_map (old_id, new_id)
    SELECT r.id, gen_random_uuid()
    FROM public.task_resources r
    JOIN temp_task_map tm ON r.task_id = tm.old_id;

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

    UPDATE public.tasks t
    SET primary_resource_id = rm.new_id
    FROM public.tasks original
    JOIN temp_task_map tm ON original.id = tm.old_id
    JOIN temp_res_map rm ON original.primary_resource_id = rm.old_id
    WHERE t.id = tm.new_id;

    SELECT COUNT(*) INTO v_tasks_count FROM temp_task_map;

    RETURN jsonb_build_object(
        'new_root_id', v_top_new_id,
        'root_project_id', v_new_root_id,
        'tasks_cloned', v_tasks_count
    );
END;
$$;

GRANT ALL ON FUNCTION public.clone_project_template(
    uuid, uuid, text, uuid, text, text, timestamp with time zone, timestamp with time zone
) TO authenticated;
GRANT ALL ON FUNCTION public.clone_project_template(
    uuid, uuid, text, uuid, text, text, timestamp with time zone, timestamp with time zone
) TO service_role;
