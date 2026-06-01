-- Broaden the waterfall-recompute skip to cover dateless roots (templates).
--
-- 20260521000000 made trigger_waterfall_recompute skip on DELETE when the
-- project root no longer exists (teardown). That fixed project/template ROOT
-- deletes, but a NON-root delete inside a TEMPLATE is still broken: most
-- templates have start_date = NULL (they are date-relative via days_from_start),
-- the root row still exists during a child delete, so recompute_project_dates_
-- waterfall() runs and hits its own `RAISE 'Project has no start_date'`. That
-- is exactly the "delete a task from a template -> Project has no start_date"
-- symptom.
--
-- Cleaner guard: only recompute when the project root still exists AND is
-- date-anchored (start_date NOT NULL). One condition covers every skip case:
--   * teardown delete  -> root row gone        -> SELECT finds nothing -> NULL -> skip
--   * template          -> start_date NULL                              -> skip
--   * dateless instance -> start_date NULL                              -> skip
-- recompute_project_dates_waterfall RAISEs for all of these, so skipping is
-- strictly correct — there is no valid waterfall to compute without an anchor.
--
-- This also makes INSERT/UPDATE on dateless templates/projects no longer crash
-- through the recompute (previously they would have RAISEd the same error).

CREATE OR REPLACE FUNCTION public.trigger_waterfall_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_project_id uuid;
    v_root_start timestamptz;
BEGIN
    -- Skip if we're inside an active waterfall recompute (its own writes).
    IF current_setting('app.in_waterfall_recompute', true) = 'on' THEN
        RETURN NULL;
    END IF;

    v_project_id := COALESCE(NEW.root_id, OLD.root_id);
    IF v_project_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Only recompute when the root still exists and is date-anchored. Covers
    -- teardown deletes (root row gone) AND templates / dateless projects
    -- (start_date NULL) — recompute_project_dates_waterfall RAISEs for all of
    -- these, which previously blocked deletes and dateless-template edits.
    SELECT start_date INTO v_root_start
    FROM public.tasks
    WHERE id = v_project_id AND parent_task_id IS NULL;

    IF v_root_start IS NULL THEN
        RETURN NULL;
    END IF;

    PERFORM public.recompute_project_dates_waterfall(v_project_id);
    RETURN NULL;
END;
$$;
