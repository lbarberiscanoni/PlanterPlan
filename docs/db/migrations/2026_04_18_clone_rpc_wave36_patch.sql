-- Wave 36 follow-up — Patch clone_project_template to stamp cloned_from_task_id
--
-- The Wave 36 Task 1 + Task 2 migrations added `template_version` and
-- `cloned_from_task_id` columns on public.tasks, but neither the Wave 22
-- date-typed overload nor the post-Wave-22 timestamptz overload of
-- `clone_project_template` (docs/db/schema.sql lines 363 and 475) learned
-- about them. Without this patch, every cloned descendant has
-- `cloned_from_task_id IS NULL`, which makes the Wave 36 app-side delete
-- guard silently unreachable regardless of which overload the client hits.
--
-- This migration replaces BOTH 8-param overloads so the column is stamped
-- no matter which one PostgREST picks based on the caller's param types.
-- Both bodies are byte-equivalent to the current schema.sql snapshots
-- except for:
--   1. `cloned_from_task_id` added to the INSERT column list and sourced
--      from `t.id` — every cloned task points back to its template source.
--
-- Note on `settings.cloned_from_template_version`: that stamp still runs
-- client-side via `planter.entities.Task.clone` (see src/shared/api/
-- planterClient.ts) so it can merge with the pre-existing
-- `spawnedFromTemplate` stamp in one atomic write. Server-side belt-and-
-- suspenders isn't worth the RPC surface churn.
--
-- Additive only. Does not change either RPC's public signature or return
-- shape; the `has_permission` auth check in the timestamptz overload is
-- preserved byte-for-byte.

CREATE OR REPLACE FUNCTION public.clone_project_template(
    p_template_id uuid,
    p_new_parent_id uuid,
    p_new_origin text,
    p_user_id uuid,
    p_title text DEFAULT NULL,
    p_description text DEFAULT NULL,
    p_start_date date DEFAULT NULL,
    p_due_date date DEFAULT NULL
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
BEGIN
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
        SELECT root_id INTO v_new_root_id FROM public.tasks WHERE id = p_new_parent_id;
        IF v_new_root_id IS NULL THEN
            RAISE EXCEPTION 'Parent task % has no root_id', p_new_parent_id;
        END IF;
    END IF;

    -- Wave 36 Task 2: add cloned_from_task_id to the INSERT and source it
    -- from t.id so every cloned descendant points back to its template
    -- source. Pre-Wave-36 rows stay NULL (documented behavior).
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
        p_user_id,
        p_new_origin,
        CASE WHEN t.id = p_template_id AND p_title IS NOT NULL THEN p_title ELSE t.title END,
        CASE WHEN t.id = p_template_id AND p_description IS NOT NULL THEN p_description ELSE t.description END,
        t.status, t.position,
        t.notes, t.purpose, t.actions, false, t.days_from_start,
        CASE WHEN t.id = p_template_id THEN p_start_date ELSE null END,
        CASE WHEN t.id = p_template_id THEN p_due_date ELSE null END,
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

-- ----------------------------------------------------------------------------
-- Timestamptz overload (the one PostgREST picks when the client passes ISO
-- date strings that parse as timestamptz). Adds `cloned_from_task_id` to the
-- INSERT; preserves the `has_permission` auth check and the interval-based
-- date shift from the current schema.sql snapshot.
-- ----------------------------------------------------------------------------

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
BEGIN
    -- Security check preserved byte-for-byte from the current schema.sql snapshot.
    SELECT COALESCE(root_id, id) INTO v_template_root_id FROM public.tasks WHERE id = p_template_id;

    IF v_template_root_id IS NULL OR NOT public.has_permission(v_template_root_id, (SELECT auth.uid()), 'member') THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to access this template.';
    END IF;

    SELECT start_date INTO v_old_start_date FROM public.tasks WHERE id = p_template_id;

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
        SELECT root_id INTO v_new_root_id FROM public.tasks WHERE id = p_new_parent_id;
        IF v_new_root_id IS NULL THEN
            RAISE EXCEPTION 'Parent task % has no root_id', p_new_parent_id;
        END IF;
    END IF;

    -- Wave 36 Task 2: add cloned_from_task_id to the INSERT and source it
    -- from t.id so every cloned descendant points back to its template
    -- source. Matches the date-typed overload above.
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
        p_user_id,
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
