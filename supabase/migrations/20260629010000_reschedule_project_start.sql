-- Anchored subtree reschedule: move a project's launch (start) date and shift
-- every descendant by the same delta.
--
-- Background: the date engine moved to a bottom-up ENVELOPE roll-up
-- (20260619100000_date_engine_envelope_rollup.sql). A container's start/due is
-- now MIN/MAX of its children, and `enforce_task_date_envelope` rejects any
-- parent date that would leave a child outside the parent's span. That made the
-- "Launch date correction" field in EditProjectModal unusable: pushing a
-- project's start later than its existing children raised
-- "existing child task dates are outside parent task dates" and rolled the whole
-- update back (the old `trg_waterfall_recompute` cascade that used to move the
-- children along with it was removed in the envelope switch).
--
-- This RPC restores parent->child propagation as an explicit reschedule. It
-- shifts start_date AND due_date of the root and ALL descendants by the same
-- integer-day delta, preserving every task's duration and relative offset
-- (`days_from_start` is unchanged because the whole tree moves together). The
-- per-task BEFORE/AFTER date triggers stay internally consistent under a uniform
-- shift (leaf due = start + duration; containers roll up to the same min/max).
--
-- SECURITY DEFINER + postgres owner: `enforce_task_date_envelope` early-returns
-- for current_user IN ('postgres','supabase_admin'), so the bulk shift is not
-- tripped by the envelope guard mid-rewrite.

CREATE OR REPLACE FUNCTION public.reschedule_project_start(
    p_root_id uuid,
    p_new_start date
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_root public.tasks%ROWTYPE;
    v_old_start date;
    v_delta_days integer;
    v_rows_shifted integer;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: not authenticated.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_root
    FROM public.tasks
    WHERE id = p_root_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project % not found.', p_root_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_root.parent_task_id IS NOT NULL THEN
        RAISE EXCEPTION 'reschedule_project_start expects a project root; % has a parent.', p_root_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Same access surface as task CRUD: admin or any member of the project.
    IF NOT (public.is_admin(v_actor_id) OR public.is_active_member(p_root_id, v_actor_id)) THEN
        RAISE EXCEPTION 'Access denied: requires admin or project membership.'
            USING ERRCODE = '42501';
    END IF;

    IF p_new_start IS NULL THEN
        RAISE EXCEPTION 'reschedule_project_start requires a non-null start date.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_root.start_date IS NULL THEN
        RAISE EXCEPTION 'Project % has no start date to shift from; set task dates first.', p_root_id
            USING ERRCODE = 'P0001';
    END IF;

    v_old_start := (v_root.start_date AT TIME ZONE 'UTC')::date;
    v_delta_days := p_new_start - v_old_start;

    IF v_delta_days = 0 THEN
        RETURN jsonb_build_object(
            'root_id', p_root_id,
            'new_start', p_new_start,
            'delta_days', 0,
            'rows_shifted', 0
        );
    END IF;

    -- root_id covers the entire tree (the root's own root_id = its id).
    UPDATE public.tasks
    SET start_date = start_date + make_interval(days => v_delta_days),
        due_date = CASE
            WHEN due_date IS NULL THEN NULL
            ELSE due_date + make_interval(days => v_delta_days)
        END,
        updated_at = now()
    WHERE root_id = p_root_id
      AND start_date IS NOT NULL;

    GET DIAGNOSTICS v_rows_shifted = ROW_COUNT;

    RETURN jsonb_build_object(
        'root_id', p_root_id,
        'new_start', p_new_start,
        'delta_days', v_delta_days,
        'rows_shifted', v_rows_shifted
    );
END;
$$;

ALTER FUNCTION public.reschedule_project_start(uuid, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reschedule_project_start(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reschedule_project_start(uuid, date) TO authenticated;

COMMENT ON FUNCTION public.reschedule_project_start(uuid, date) IS
    'Anchored subtree reschedule. Shifts a project root and all descendants by (p_new_start - root.start_date) days, preserving durations and relative offsets. Admin or project member only. SECURITY DEFINER/postgres-owned so the envelope guard bypasses during the bulk shift.';
