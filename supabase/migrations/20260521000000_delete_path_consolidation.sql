-- Consolidation: un-break project/template deletes + restore the legacy entry point.
--
-- Diagnosed on prod 2026-05-26 (DB drift — these objects live only on the
-- `refactor` "due date engine v2" line, never in earlier source migrations):
--
--   trg_waterfall_recompute  AFTER INSERT OR DELETE OR UPDATE ...
--       EXECUTE FUNCTION trigger_waterfall_recompute()
--
-- trigger_waterfall_recompute() calls recompute_project_dates_waterfall(root),
-- which (1) auth-checks has_project_role(root, uid, planter|team) and (2)
-- requires the root to have a start_date. On a DELETE that tears down a
-- project/template ROOT, the AFTER trigger fires after the root row — and its
-- project_members — are already cascade-deleted, so the recompute hits:
--   * planter: has_project_role -> false  -> RAISE 'Access denied'           (bare, P0001)
--   * admin:   root row gone / NULL start  -> RAISE 'Project has no start_date' (P0001)
-- Either way every project AND template delete is blocked. This is exactly the
-- set of symptoms reported (access-denied on project delete, "no start_date"
-- on template delete and template-task delete).
--
-- Fix is surgical and leaves all INSERT/UPDATE and live-project delete
-- behavior untouched: the waterfall trigger now SKIPS when the target project
-- root no longer exists (i.e. we're mid-teardown). For a non-root delete the
-- root still exists, so the desired post-delete date reflow still happens.
--
-- NOTE for the date-engine-v2 owner: this redefines trigger_waterfall_recompute
-- in a committed migration. Fold this DELETE guard into your own waterfall
-- migration when it merges so the two don't drift apart.

----------------------------------------------------------------------
-- 1. Waterfall trigger: skip recompute during a project/template teardown.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_waterfall_recompute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_project_id uuid;
BEGIN
    -- Skip if we're inside an active waterfall recompute (its own writes).
    IF current_setting('app.in_waterfall_recompute', true) = 'on' THEN
        RETURN NULL;
    END IF;

    v_project_id := COALESCE(NEW.root_id, OLD.root_id);
    IF v_project_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- Teardown guard: on DELETE, if the project root no longer exists we are
    -- in the middle of a project/template cascade-delete. Recomputing against
    -- a deleted root raises bare 'Access denied' (planter, members gone) or
    -- 'Project has no start_date' (admin, root row gone) and blocks the whole
    -- delete. A non-root delete leaves the root in place, so the reflow below
    -- still runs and dates settle correctly after the row is removed.
    IF TG_OP = 'DELETE'
       AND NOT EXISTS (
           SELECT 1 FROM public.tasks
           WHERE id = v_project_id AND parent_task_id IS NULL
       )
    THEN
        RETURN NULL;
    END IF;

    PERFORM public.recompute_project_dates_waterfall(v_project_id);
    RETURN NULL;
END;
$$;

----------------------------------------------------------------------
-- 2. Backward-compat shim: the deployed frontend still calls delete_project.
--    Route it to delete_task so the live app works regardless of when the
--    new client (which calls delete_task directly) deploys.
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    RETURN public.delete_task(p_project_id);
END;
$$;

ALTER FUNCTION public.delete_project(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project(uuid) TO authenticated;

COMMENT ON FUNCTION public.delete_project(uuid) IS
    'Backward-compat shim -> delete_task(uuid). Kept so the deployed frontend that still calls delete_project keeps working until the delete_task client ships.';
