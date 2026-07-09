-- Proportional project-duration rescale (Wave: 2026-07 feedback item #1).
--
-- Lets a planter retarget a project's finish date and have the REMAINING work
-- reflow proportionally to hit it. Editing the (previously read-only, derived)
-- Project Due Date in EditProjectModal calls this RPC.
--
-- Semantics (agreed with stakeholder):
--   * Completed / N/A tasks are FROZEN — their dates never move (history stays).
--   * The incomplete block's earliest start is the fixed ANCHOR; incomplete leaf
--     tasks scale proportionally about that anchor so the latest of them lands
--     EXACTLY on p_target_due (the critical task is pinned; rounding never drifts
--     the end date).
--   * Durations may compress to 0 (a single-day point task) — no 1-day floor.
--
-- Only LEAF tasks are rewritten (start_date + duration). The per-row BEFORE
-- trigger (compute_leaf_due_date) re-derives due = start + duration and the
-- AFTER roll-up (calc_task_date_rollup) rebuilds every container + the root.
--
-- SECURITY DEFINER + postgres owner: enforce_task_date_envelope early-returns for
-- current_user IN ('postgres','supabase_admin'), so partial mid-rewrite states
-- (an incomplete task momentarily outside its parent) don't trip the guard.
-- Same auth surface as reschedule_project_start: admin or project member.

CREATE OR REPLACE FUNCTION public.rescale_project_incomplete(
    p_root_id uuid,
    p_target_due date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_root public.tasks%ROWTYPE;
    v_anchor date;
    v_cur_end date;
    v_factor numeric;
    v_pinned uuid;
    v_rows integer;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: not authenticated.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_root FROM public.tasks WHERE id = p_root_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project % not found.', p_root_id USING ERRCODE = 'P0002';
    END IF;
    IF v_root.parent_task_id IS NOT NULL THEN
        RAISE EXCEPTION 'rescale_project_incomplete expects a project root; % has a parent.', p_root_id
            USING ERRCODE = 'P0001';
    END IF;
    IF NOT (public.is_admin(v_actor_id) OR public.is_active_member(p_root_id, v_actor_id)) THEN
        RAISE EXCEPTION 'Access denied: requires admin or project membership.' USING ERRCODE = '42501';
    END IF;
    IF p_target_due IS NULL THEN
        RAISE EXCEPTION 'rescale_project_incomplete requires a non-null target due date.' USING ERRCODE = 'P0001';
    END IF;

    -- Anchor = earliest incomplete start; current end = latest incomplete due.
    SELECT min((t.start_date AT TIME ZONE 'UTC')::date),
           max((t.due_date  AT TIME ZONE 'UTC')::date)
      INTO v_anchor, v_cur_end
    FROM public.tasks t
    WHERE t.root_id = p_root_id
      AND t.parent_task_id IS NOT NULL
      AND t.start_date IS NOT NULL AND t.due_date IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = t.id)
      AND COALESCE(lower(t.status), '') NOT IN ('completed', 'na')
      AND COALESCE(t.is_complete, false) = false;

    IF v_anchor IS NULL THEN
        RAISE EXCEPTION 'No incomplete, dated tasks to rescale in project %.', p_root_id USING ERRCODE = 'P0001';
    END IF;
    IF v_cur_end <= v_anchor THEN
        RAISE EXCEPTION 'Remaining tasks span a single day; nothing to rescale proportionally.'
            USING ERRCODE = 'P0001';
    END IF;
    IF p_target_due <= v_anchor THEN
        RAISE EXCEPTION 'Target due date % must be after the earliest remaining task start (%).',
            p_target_due, v_anchor USING ERRCODE = 'P0001';
    END IF;

    v_factor := (p_target_due - v_anchor)::numeric / (v_cur_end - v_anchor)::numeric;

    -- The critical task (latest end) is pinned so the project ends EXACTLY on target.
    SELECT t.id INTO v_pinned
    FROM public.tasks t
    WHERE t.root_id = p_root_id
      AND t.parent_task_id IS NOT NULL
      AND t.start_date IS NOT NULL AND t.due_date IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = t.id)
      AND COALESCE(lower(t.status), '') NOT IN ('completed', 'na')
      AND COALESCE(t.is_complete, false) = false
    ORDER BY (t.due_date AT TIME ZONE 'UTC')::date DESC, t.id DESC
    LIMIT 1;

    WITH src AS (
        SELECT t.id,
               (t.start_date AT TIME ZONE 'UTC')::date AS s,
               (t.due_date  AT TIME ZONE 'UTC')::date AS d,
               (v_anchor + round(
                   (((t.start_date AT TIME ZONE 'UTC')::date - v_anchor)::numeric) * v_factor
               )::int) AS new_start
        FROM public.tasks t
        WHERE t.root_id = p_root_id
          AND t.parent_task_id IS NOT NULL
          AND t.start_date IS NOT NULL AND t.due_date IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = t.id)
          AND COALESCE(lower(t.status), '') NOT IN ('completed', 'na')
          AND COALESCE(t.is_complete, false) = false
    )
    UPDATE public.tasks t
    SET start_date = (src.new_start::timestamp AT TIME ZONE 'UTC'),
        duration = CASE
            WHEN t.id = v_pinned THEN greatest(0, (p_target_due - src.new_start))
            ELSE greatest(0, round(((src.d - src.s)::numeric) * v_factor)::int)
        END,
        updated_at = now()
    FROM src
    WHERE t.id = src.id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    RETURN jsonb_build_object(
        'root_id', p_root_id,
        'target_due', p_target_due,
        'anchor', v_anchor,
        'previous_end', v_cur_end,
        'factor', round(v_factor, 4),
        'rows_rescaled', v_rows
    );
END;
$$;

ALTER FUNCTION public.rescale_project_incomplete(uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rescale_project_incomplete(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rescale_project_incomplete(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.rescale_project_incomplete(uuid, date) IS
    'Proportionally reflow a project''s INCOMPLETE leaf tasks so the latest lands exactly on p_target_due, keeping the earliest incomplete start as a fixed anchor and freezing completed tasks. Admin or project member only. SECURITY DEFINER/postgres-owned so the envelope guard bypasses during the bulk rewrite.';
