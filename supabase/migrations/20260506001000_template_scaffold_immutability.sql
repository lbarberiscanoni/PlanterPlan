-- PR 2: template scaffold immutability.
--
-- Cloned instance rows are historical scaffold rows. Runtime workflow fields
-- may continue to move, but direct app-role deletes and structural/content
-- mutations are blocked below the UI.

CREATE OR REPLACE FUNCTION public.clone_project_template(
    p_template_id uuid,
    p_new_parent_id uuid,
    p_new_origin text,
    p_user_id uuid,
    p_title text DEFAULT NULL::text,
    p_description text DEFAULT NULL::text,
    p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_due_date timestamp with time zone DEFAULT NULL::timestamp with time zone
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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

    INSERT INTO public.tasks (
        id, parent_task_id, root_id, creator, origin,
        title, description, status, position,
        notes, purpose, actions, settings, is_complete, days_from_start, start_date, due_date,
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
                    'is_coaching_task',
                        CASE WHEN t.settings -> 'is_coaching_task' = 'true'::jsonb THEN true ELSE NULL END,
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

CREATE OR REPLACE FUNCTION public.enforce_template_scaffold_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_key text;
    v_protected_setting_keys text[] := ARRAY[
        'is_coaching_task',
        'is_strategy_template',
        'spawnedFromTemplate',
        'spawnedOn',
        'cloned_from_template_version',
        'recurrence',
        'published',
        'seed_key'
    ];
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR auth.role() = 'service_role'
    THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL THEN
            RAISE EXCEPTION 'protected template scaffold tasks cannot be deleted'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;

    IF NOT (OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL)
        AND NEW.origin = 'instance'
        AND NEW.cloned_from_task_id IS NOT NULL
    THEN
        RAISE EXCEPTION 'template scaffold provenance is managed by clone_project_template'
            USING ERRCODE = 'P0001';
    END IF;

    IF OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL THEN
        IF
            OLD.id IS DISTINCT FROM NEW.id
            OR OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id
            OR OLD.title IS DISTINCT FROM NEW.title
            OR OLD.description IS DISTINCT FROM NEW.description
            OR OLD.origin IS DISTINCT FROM NEW.origin
            OR OLD.creator IS DISTINCT FROM NEW.creator
            OR OLD.root_id IS DISTINCT FROM NEW.root_id
            OR OLD.purpose IS DISTINCT FROM NEW.purpose
            OR OLD.actions IS DISTINCT FROM NEW.actions
            OR OLD.position IS DISTINCT FROM NEW.position
            OR OLD.created_at IS DISTINCT FROM NEW.created_at
            OR OLD.prerequisite_phase_id IS DISTINCT FROM NEW.prerequisite_phase_id
            OR OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id
            OR OLD.project_type IS DISTINCT FROM NEW.project_type
            OR OLD.is_premium IS DISTINCT FROM NEW.is_premium
            OR OLD.location IS DISTINCT FROM NEW.location
            OR OLD.task_type IS DISTINCT FROM NEW.task_type
            OR OLD.template_version IS DISTINCT FROM NEW.template_version
            OR OLD.cloned_from_task_id IS DISTINCT FROM NEW.cloned_from_task_id
        THEN
            RAISE EXCEPTION 'protected template scaffold fields cannot be changed'
                USING ERRCODE = 'P0001';
        END IF;

        FOREACH v_key IN ARRAY v_protected_setting_keys LOOP
            IF (COALESCE(OLD.settings, '{}'::jsonb) -> v_key)
                IS DISTINCT FROM
               (COALESCE(NEW.settings, '{}'::jsonb) -> v_key)
            THEN
                RAISE EXCEPTION 'protected template scaffold settings cannot be changed: %', v_key
                    USING ERRCODE = 'P0001';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_template_scaffold_immutability ON public.tasks;
CREATE TRIGGER trg_enforce_template_scaffold_immutability
BEFORE UPDATE OR DELETE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_template_scaffold_immutability();

COMMENT ON FUNCTION public.enforce_template_scaffold_immutability() IS
  'Blocks app-role structural/content mutation and deletion of cloned instance scaffold rows. Explicit postgres/service_role bypass is reserved for audited maintenance.';
