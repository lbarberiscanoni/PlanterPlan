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
        notes, purpose, actions, settings, is_complete, days_from_start, start_date, due_date,
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
        CASE WHEN p_new_origin = 'instance' THEN NULL::text ELSE t.notes END,
        t.purpose,
        t.actions,
        CASE
            WHEN p_new_origin = 'template' THEN COALESCE(t.settings, '{}'::jsonb)
            ELSE jsonb_strip_nulls(jsonb_build_object(
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
        END,
        false,
        t.days_from_start,
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

    SELECT COUNT(*), (
        SELECT pm.user_id
          FROM public.project_members pm
         WHERE pm.project_id = v_project_id
           AND pm.role = 'coach'
         ORDER BY pm.user_id
         LIMIT 1
    )
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

    SELECT COUNT(*), (
        SELECT pm.user_id
          FROM public.project_members pm
         WHERE pm.project_id = v_project_id
           AND pm.role = 'coach'
         ORDER BY pm.user_id
         LIMIT 1
    )
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
