-- PR 5: task date envelope guard.
--
-- Parent rollups can still derive ranges from children, but direct app/API
-- writes may not place a dated child outside an already-dated parent.

CREATE OR REPLACE FUNCTION public.enforce_task_date_envelope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_new_start date := CASE
        WHEN NEW.start_date IS NULL THEN NULL
        ELSE (NEW.start_date AT TIME ZONE 'UTC')::date
    END;
    v_new_due date := CASE
        WHEN NEW.due_date IS NULL THEN NULL
        ELSE (NEW.due_date AT TIME ZONE 'UTC')::date
    END;
    v_parent_start date;
    v_parent_due date;
BEGIN
    IF auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF v_new_start IS NOT NULL
        AND v_new_due IS NOT NULL
        AND v_new_due < v_new_start
    THEN
        RAISE EXCEPTION 'task date envelope invalid: due date cannot be before start date'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.parent_task_id IS NOT NULL THEN
        SELECT
            CASE
                WHEN parent.start_date IS NULL THEN NULL
                ELSE (parent.start_date AT TIME ZONE 'UTC')::date
            END,
            CASE
                WHEN parent.due_date IS NULL THEN NULL
                ELSE (parent.due_date AT TIME ZONE 'UTC')::date
            END
        INTO v_parent_start, v_parent_due
        FROM public.tasks parent
        WHERE parent.id = NEW.parent_task_id;

        -- Let the FK report a missing parent instead of masking it here.
        IF v_parent_start IS NOT NULL
            AND v_new_start IS NOT NULL
            AND v_new_start < v_parent_start
        THEN
            RAISE EXCEPTION 'task dates must stay within parent task dates; move the parent task first'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_parent_due IS NOT NULL
            AND v_new_due IS NOT NULL
            AND v_new_due > v_parent_due
        THEN
            RAISE EXCEPTION 'task dates must stay within parent task dates; move the parent task first'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_parent_due IS NOT NULL
            AND v_new_start IS NOT NULL
            AND v_new_start > v_parent_due
        THEN
            RAISE EXCEPTION 'task dates must stay within parent task dates; move the parent task first'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_parent_start IS NOT NULL
            AND v_new_due IS NOT NULL
            AND v_new_due < v_parent_start
        THEN
            RAISE EXCEPTION 'task dates must stay within parent task dates; move the parent task first'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF v_new_start IS NOT NULL OR v_new_due IS NOT NULL THEN
        PERFORM 1
        FROM public.tasks child
        WHERE child.parent_task_id = NEW.id
          AND child.id <> NEW.id
          AND (
              (
                  v_new_start IS NOT NULL
                  AND child.start_date IS NOT NULL
                  AND (child.start_date AT TIME ZONE 'UTC')::date < v_new_start
              )
              OR
              (
                  v_new_start IS NOT NULL
                  AND child.due_date IS NOT NULL
                  AND (child.due_date AT TIME ZONE 'UTC')::date < v_new_start
              )
              OR
              (
                  v_new_due IS NOT NULL
                  AND child.start_date IS NOT NULL
                  AND (child.start_date AT TIME ZONE 'UTC')::date > v_new_due
              )
              OR
              (
                  v_new_due IS NOT NULL
                  AND child.due_date IS NOT NULL
                  AND (child.due_date AT TIME ZONE 'UTC')::date > v_new_due
              )
          )
        LIMIT 1;

        IF FOUND THEN
            RAISE EXCEPTION 'task date envelope invalid: existing child task dates are outside parent task dates'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_task_date_envelope() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_task_date_envelope() IS
    'Rejects direct task date writes that invert dates, move children outside dated parents, or shrink parents around existing children.';

DROP TRIGGER IF EXISTS "trg_enforce_task_date_envelope" ON public.tasks;
CREATE TRIGGER "trg_enforce_task_date_envelope"
BEFORE INSERT OR UPDATE OF parent_task_id, start_date, due_date ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_date_envelope();
