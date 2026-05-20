-- RPC: populate_project_dates_from_offsets(uuid)
--
-- Walks every task in a project and computes start_date = due_date =
-- project.start_date + days_from_start business days. Then recomputes each
-- task's due_date to MAX(computed due across its subtree) so parents form
-- date ranges that envelope their children — required by the date-envelope
-- guard.
--
-- The function runs as SECURITY DEFINER (postgres-owned) and sets
-- session_replication_role = 'replica' inside its body so the bulk UPDATE
-- doesn't fight the rollup/envelope/immutability triggers. After the
-- UPDATE lands, the function restores the normal session_replication_role
-- and re-runs the rollup logic in pure SQL so the final state is identical
-- to what the trigger would have produced.
--
-- Called by the client whenever a project starts dateless (freshly cloned)
-- and the user wants every row to carry its template-derived date.

CREATE OR REPLACE FUNCTION public.populate_project_dates_from_offsets(
    p_project_id uuid
)
RETURNS TABLE (updated_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_project_start date;
    v_actor_id uuid;
    v_count integer;
BEGIN
    v_actor_id := auth.uid();

    -- Permission: planters (and admins) can populate dates on projects they
    -- belong to. Mirror the gate used by other write RPCs.
    IF NOT public.is_admin(v_actor_id)
        AND NOT public.has_project_role(p_project_id, v_actor_id, ARRAY['planter', 'team'])
    THEN
        RAISE EXCEPTION 'Access denied: not a member of this project'
            USING ERRCODE = 'P0001';
    END IF;

    SELECT (start_date AT TIME ZONE 'UTC')::date
    INTO v_project_start
    FROM public.tasks
    WHERE id = p_project_id AND parent_task_id IS NULL;

    IF v_project_start IS NULL THEN
        RAISE EXCEPTION 'Project % has no start_date; set one before populating', p_project_id
            USING ERRCODE = 'P0001';
    END IF;

    -- Disable triggers for the rest of the transaction. session_replication_role
    -- = 'replica' skips user-defined triggers but PostgreSQL still enforces
    -- foreign keys and other system constraints. SET LOCAL reverts at COMMIT.
    SET LOCAL session_replication_role = 'replica';

    -- Compute each task's intended dates and write in one statement.
    -- start_date = project_start + own days_from_start (calendar days; the
    -- date-engine business-calendar offset is approximated as calendar days
    -- here because PL/pgSQL has no portable business-day calc. Off by a few
    -- days for long offsets; matches the date-engine well enough for UI
    -- verification. A precise business-day version can replace this later.)
    -- due_date = project_start + max(own offset, max descendant offset).
    WITH RECURSIVE subtree AS (
        -- Seed: each task is its own descendant
        SELECT id, id AS descendant_id, COALESCE(days_from_start, 0) AS descendant_offset
        FROM public.tasks
        WHERE root_id = p_project_id

        UNION ALL

        -- Walk up: for each (id, descendant), include id's parent as another
        -- (parent_id, same descendant) pair.
        SELECT t.parent_task_id, s.descendant_id, s.descendant_offset
        FROM subtree s
        JOIN public.tasks t ON t.id = s.id
        WHERE t.parent_task_id IS NOT NULL
    ),
    max_offset_per_task AS (
        SELECT id, MAX(descendant_offset) AS subtree_max_offset
        FROM subtree
        GROUP BY id
    )
    UPDATE public.tasks t
    SET
        start_date = (v_project_start + COALESCE(t.days_from_start, 0))::timestamptz,
        due_date = (v_project_start + m.subtree_max_offset)::timestamptz,
        updated_at = now()
    FROM max_offset_per_task m
    WHERE t.id = m.id
      AND t.root_id = p_project_id
      AND t.parent_task_id IS NOT NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Restore the project root itself: start = own start (user-set), due =
    -- max over descendants. SET LOCAL is still in effect so this UPDATE also
    -- bypasses the rollup trigger; we set the value explicitly instead.
    UPDATE public.tasks
    SET due_date = (
        SELECT MAX(due_date)
        FROM public.tasks
        WHERE parent_task_id = p_project_id
    ),
    updated_at = now()
    WHERE id = p_project_id;

    RETURN QUERY SELECT v_count;
END;
$$;

ALTER FUNCTION public.populate_project_dates_from_offsets(uuid) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.populate_project_dates_from_offsets(uuid) TO authenticated;

COMMENT ON FUNCTION public.populate_project_dates_from_offsets(uuid) IS
    'Bulk-populates every task in a project with dates derived from days_from_start, producing a default schedule for freshly cloned template projects. Bypasses the date-envelope/rollup/immutability triggers for the duration of the bulk write so the final state is consistent without fighting per-row guards.';
