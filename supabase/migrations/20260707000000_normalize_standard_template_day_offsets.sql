-- Normalize the "Standard Church Plant" template's day offsets to 0-based.
--
-- The template was imported (commit e74742bd) straight from a 1-based source
-- column (`days_from_start_until_due`): its earliest actionable task sits at
-- days_from_start = 1, and no task sits at 0. But the date engine treats
-- days_from_start as a 0-based offset from the project start
-- (clone seeds leaf start = anchor::date + days_from_start). The mismatch made
-- every cloned project start ONE DAY AFTER the start date the user picks: the
-- root's start_date rolls up to min(children) = anchor + 1.
--
-- Fix: subtract the smallest leaf offset from every task in the template so the
-- earliest task anchors exactly to the chosen start date. Relative spacing is
-- preserved. generate.py now emits 0-based offsets, so re-imports stay correct.
--
-- Idempotent: if the template is already 0-based (a leaf at offset 0), this is a
-- no-op. Scoped to the template only; existing cloned instances are unchanged
-- (re-clone to pick up the corrected dates).

DO $$
DECLARE
    v_root uuid := '2dfd71b3-a18e-5f11-b5c4-a5216dc95cc1'; -- Standard Church Plant root
    v_min  int;
BEGIN
    -- Smallest offset among leaf tasks (tasks with no children).
    SELECT MIN(t.days_from_start)
    INTO v_min
    FROM public.tasks t
    WHERE t.origin = 'template'
      AND t.root_id = v_root
      AND t.parent_task_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = t.id);

    IF v_min IS NULL OR v_min <= 0 THEN
        RAISE NOTICE 'Standard Church Plant template already 0-based (min leaf offset = %); skipping.', v_min;
        RETURN;
    END IF;

    UPDATE public.tasks t
    SET days_from_start = GREATEST(t.days_from_start - v_min, 0)
    WHERE t.origin = 'template'
      AND t.root_id = v_root;

    RAISE NOTICE 'Normalized Standard Church Plant template day offsets by -% (now 0-based).', v_min;
END $$;
