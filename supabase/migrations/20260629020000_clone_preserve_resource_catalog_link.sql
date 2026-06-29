-- Preserve resource catalog provenance through template cloning.
--
-- Phase 2 of the resources catalog (20260619140000_task_resource_alias.sql)
-- added `task_resources.name` (display alias) and `task_resources.resource_id`
-- (FK -> resources catalog). But clone_project_template was authored BEFORE
-- those columns existed, so its task_resources INSERT omits them. Result:
-- cloning a template into a project copies the resource rows but NULLs out
-- their alias name and their catalog link — exactly the "admin links a master
-- resource to a template task, it flows to users on clone" workflow Patrick/Tim
-- agreed on (2026-06). This re-creates the function with `name` and
-- `resource_id` carried through. Everything else is verbatim from the prior
-- definition (20260619120000_clone_envelope_dates.sql).

CREATE OR REPLACE FUNCTION public.clone_project_template(
    p_template_id uuid,
    p_new_parent_id uuid,
    p_new_origin text,
    p_user_id uuid,
    p_title text DEFAULT NULL::text,
    p_description text DEFAULT NULL::text,
    p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_new_root_id uuid;
    v_top_new_id uuid;
    v_tasks_count int;
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
        lower(COALESCE(r.settings ->> 'published', 'false')) = 'true'
    INTO
        v_template_root_id,
        v_template_origin,
        v_template_creator,
        v_template_published
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
        SELECT COALESCE(root_id, id) INTO v_new_root_id FROM public.tasks WHERE id = p_new_parent_id;
        IF v_new_root_id IS NULL THEN
             RAISE EXCEPTION 'Parent task % has no root_id', p_new_parent_id;
        END IF;

        IF NOT public.is_admin(v_actor_id)
            AND NOT public.has_project_role(v_new_root_id, v_actor_id, ARRAY['planter', 'team'])
        THEN
            RAISE EXCEPTION 'Access denied: You do not have permission to modify the destination project.';
        END IF;
    END IF;

    INSERT INTO public.tasks (
        id, parent_task_id, root_id, creator, origin,
        title, description, status, position,
        notes, purpose, actions, settings, is_complete, days_from_start, duration, start_date, due_date,
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
        CASE WHEN p_new_origin = 'instance' THEN NULL::text ELSE t.notes END,
        t.purpose,
        t.actions,
        CASE
            WHEN p_new_origin = 'template' THEN COALESCE(t.settings, '{}'::jsonb)
            ELSE (
                jsonb_strip_nulls(jsonb_build_object(
                    'is_strategy_template',
                        CASE WHEN t.settings -> 'is_strategy_template' = 'true'::jsonb THEN true ELSE NULL END,
                    'project_kind',
                        CASE
                            WHEN t.id = p_template_id
                                AND t.settings ->> 'project_kind' IN ('date', 'checkpoint')
                            THEN t.settings ->> 'project_kind'
                            ELSE NULL
                        END
                ))
                ||
                CASE
                    WHEN t.id = p_template_id THEN jsonb_strip_nulls(jsonb_build_object(
                        'spawnedFromTemplate', p_template_id::text,
                        'cloned_from_template_version', COALESCE(t.template_version, 1)
                    ))
                    ELSE '{}'::jsonb
                END
            )
        END,
        false,
        t.days_from_start,
        t.duration,
        -- Envelope engine: seed start from the offset; due is derived by triggers.
        CASE
            WHEN p_new_origin = 'instance' AND p_start_date IS NOT NULL
                THEN (p_start_date AT TIME ZONE 'UTC')::date + COALESCE(t.days_from_start, 0)
            ELSE NULL
        END,
        NULL::timestamptz,
        t.id
    FROM public.tasks t
    JOIN temp_task_map m ON t.id = m.old_id
    LEFT JOIN temp_task_map mp ON t.parent_task_id = mp.old_id;

    -- Recompute dates: touch every leaf so the BEFORE trigger sets due =
    -- start + duration and the AFTER envelope trigger cascades MIN/MAX up to
    -- milestone -> phase -> root. Done once, after all rows exist, so the
    -- roll-up sees the complete set of children.
    UPDATE public.tasks t
    SET start_date = t.start_date
    WHERE t.root_id = v_new_root_id
      AND NOT EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = t.id);

    INSERT INTO temp_res_map (old_id, new_id)
    SELECT r.id, gen_random_uuid()
    FROM public.task_resources r
    JOIN temp_task_map tm ON r.task_id = tm.old_id;

    -- Carry `name` (display alias) and `resource_id` (catalog FK) through the
    -- clone so cloned resources keep their friendly name and stay linked to the
    -- master resources catalog.
    INSERT INTO public.task_resources (
        id, task_id, resource_type, resource_url, resource_text, storage_path, storage_bucket, name, resource_id
    )
    SELECT
        rm.new_id,
        tm.new_id,
        r.resource_type, r.resource_url, r.resource_text, r.storage_path, r.storage_bucket, r.name, r.resource_id
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
$function$;
