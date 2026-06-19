-- Date engine: switch from top-down sequential waterfall to bottom-up envelope.
--
-- Model (see docs/architecture/date-engine-envelope-spec.md):
--   * Leaf task has a start + a duration → due = start + duration (CALENDAR days).
--     start = project_start + days_from_start (offset) at clone time; thereafter
--     start_date is authoritative (drag/drop edits it directly).
--   * Container (milestone/phase/root) = envelope of its children:
--     start = MIN(child start), due = MAX(child due). Non-sequential — tasks may
--     overlap and share a due date. `position` is ordering only, not scheduling.
--
-- days_from_start keeps its original meaning (OFFSET from project start); a new
-- `duration` column holds the LENGTH.

-- 1. New length column. -----------------------------------------------------
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS duration integer NOT NULL DEFAULT 0;

-- Backfill from existing scheduled rows so current project timelines are
-- preserved (due stays = start + duration). Leaves with both dates get their
-- real length; containers' duration is irrelevant (rebuilt by the roll-up).
UPDATE public.tasks
SET duration = GREATEST(0, ((due_date AT TIME ZONE 'UTC')::date - (start_date AT TIME ZONE 'UTC')::date))
WHERE start_date IS NOT NULL AND due_date IS NOT NULL;

-- 2. Leaf due = start + duration (BEFORE write, leaves only). ----------------
CREATE OR REPLACE FUNCTION public.compute_leaf_due_date()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $function$
BEGIN
    -- Containers derive their span from children (roll-up), not from a duration.
    IF EXISTS (SELECT 1 FROM public.tasks c WHERE c.parent_task_id = NEW.id) THEN
        RETURN NEW;
    END IF;

    -- Templates / unscheduled rows stay date-NULL until cloned into a project.
    IF NEW.start_date IS NULL THEN
        NEW.due_date := NULL;
    ELSE
        NEW.due_date := ((NEW.start_date AT TIME ZONE 'UTC')::date
                         + COALESCE(NEW.duration, 0))::timestamptz;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_compute_leaf_due_date ON public.tasks;
CREATE TRIGGER trg_compute_leaf_due_date
    BEFORE INSERT OR UPDATE OF start_date, duration ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.compute_leaf_due_date();

-- 3. Retire the sequential waterfall, restore the envelope roll-up. ----------
-- calc_task_date_rollup() already exists (MIN start / MAX due to parent,
-- recursing upward, guarded at pg_trigger_depth() > 4). It was detached when the
-- waterfall took over; re-attach it and drop the waterfall trigger.
DROP TRIGGER IF EXISTS trg_waterfall_recompute ON public.tasks;

-- `duration` is included so a duration-only edit (which changes due_date via the
-- BEFORE trigger, not via the statement's SET list) still propagates upward —
-- column-specific triggers ignore BEFORE-trigger-made changes when deciding to
-- fire, so we must list the column the user actually targets.
DROP TRIGGER IF EXISTS trg_envelope_rollup ON public.tasks;
CREATE TRIGGER trg_envelope_rollup
    AFTER INSERT OR DELETE OR UPDATE OF start_date, due_date, duration, parent_task_id
    ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.calc_task_date_rollup();

-- The waterfall functions are now unreferenced. Left in place (not dropped) so
-- this migration is reversible without re-creating them; safe to remove later:
--   recompute_project_dates_waterfall, recompute_subtree_waterfall,
--   trigger_waterfall_recompute.
