-- Tighten the `calc_task_date_rollup` trigger's recursion guard from depth 10
-- back to 4, now that the data-side hierarchy cap is also 4. Deeper trigger
-- recursion via parent-chain rollups can't happen — the maximum chain is
-- project → phase → milestone → task → subtask (4 hops).
--
-- The rest of the function body is unchanged; only the guard constant moves.

CREATE OR REPLACE FUNCTION public.calc_task_date_rollup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
AS $$
DECLARE
    v_old_parent_id uuid;
    v_new_parent_id uuid;
BEGIN
    -- PlanterPlan canonical hierarchy max depth = 4. Anything beyond that is
    -- either a malformed write or a runaway trigger chain; bail out.
    IF pg_trigger_depth() > 4 THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_new_parent_id := NEW.parent_task_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_parent_id := OLD.parent_task_id;
    ELSE
        v_old_parent_id := OLD.parent_task_id;
        v_new_parent_id := NEW.parent_task_id;

        IF v_old_parent_id IS NOT DISTINCT FROM v_new_parent_id THEN
            v_old_parent_id := NULL;
        END IF;
    END IF;

    IF v_old_parent_id IS NOT NULL THEN
        UPDATE public.tasks parent
        SET start_date = sub.min_start,
            due_date = sub.max_due
        FROM (
            SELECT MIN(start_date) AS min_start, MAX(due_date) AS max_due
            FROM public.tasks
            WHERE parent_task_id = v_old_parent_id
        ) sub
        WHERE parent.id = v_old_parent_id
          AND (parent.start_date IS DISTINCT FROM sub.min_start
               OR parent.due_date IS DISTINCT FROM sub.max_due);
    END IF;

    IF v_new_parent_id IS NOT NULL THEN
        UPDATE public.tasks parent
        SET start_date = sub.min_start,
            due_date = sub.max_due
        FROM (
            SELECT MIN(start_date) AS min_start, MAX(due_date) AS max_due
            FROM public.tasks
            WHERE parent_task_id = v_new_parent_id
        ) sub
        WHERE parent.id = v_new_parent_id
          AND (parent.start_date IS DISTINCT FROM sub.min_start
               OR parent.due_date IS DISTINCT FROM sub.max_due);
    END IF;

    RETURN NULL;
END;
$$;
