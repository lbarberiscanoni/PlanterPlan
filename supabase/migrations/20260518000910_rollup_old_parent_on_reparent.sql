-- Fix: calc_task_date_rollup did not recompute the OLD parent when a task was
-- reparented (e.g. via drag-and-drop). The previous implementation only ever
-- updated NEW.parent_task_id, so the OLD parent retained dates that included
-- the contribution of the now-moved child. Symptom: after moving a dated task
-- from phase A to phase B, phase B widened correctly but phase A kept stale
-- min(start) / max(due) values reflecting the absent child.
--
-- This migration replaces the rollup function so that when an UPDATE changes
-- parent_task_id, BOTH the old and new parents are recomputed. INSERT and
-- DELETE paths are unchanged: INSERT touches only the new parent, DELETE only
-- the old parent.

CREATE OR REPLACE FUNCTION public.calc_task_date_rollup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
    v_old_parent_id uuid;
    v_new_parent_id uuid;
BEGIN
    -- Recursion guard: rollup updates the parent row, which fires this trigger
    -- again. Depth 10 covers any realistic project hierarchy.
    IF pg_trigger_depth() > 10 THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_new_parent_id := NEW.parent_task_id;
    ELSIF TG_OP = 'DELETE' THEN
        v_old_parent_id := OLD.parent_task_id;
    ELSE
        -- UPDATE
        v_old_parent_id := OLD.parent_task_id;
        v_new_parent_id := NEW.parent_task_id;

        -- Skip the old-parent recompute when the row didn't reparent.
        IF v_old_parent_id IS NOT DISTINCT FROM v_new_parent_id THEN
            v_old_parent_id := NULL;
        END IF;
    END IF;

    -- Old-parent recompute (reparent / delete): the moved row no longer counts.
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

    -- New-parent recompute (insert / reparent / in-place edit).
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

COMMENT ON FUNCTION public.calc_task_date_rollup() IS
    'Rolls min(start_date) and max(due_date) from a parent''s children up to the parent. Handles INSERT (new parent only), DELETE (old parent only), and UPDATE — including reparents, where both old and new parents are recomputed so the old parent does not retain the moved child''s contribution.';
