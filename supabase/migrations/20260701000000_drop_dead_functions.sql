-- Drop dead / vestigial functions surfaced by the 2026-07-01 Supabase audit.
--
-- 1. admin_list_tasks — backed the /admin/tasks "Manage Tasks" surface, which
--    was removed (commit fc7c34ae "Remove redundant admin Tasks tab"). No
--    client caller remains; the RPC is dead.
--
-- 2. The waterfall date-recompute cluster — left over from before the date
--    engine switched to the bottom-up envelope model. Verified externally dead:
--    no trigger is attached to trigger_waterfall_recompute, and no other
--    function / RLS policy / client call references them (they only cross-call
--    each other). Live date logic lives in the envelope triggers
--    (trg_compute_leaf_due_date, trg_enforce_task_date_envelope,
--    trg_envelope_rollup) + the reschedule_project_start RPC.
--
-- All guarded with IF EXISTS so the migration is idempotent.

DROP FUNCTION IF EXISTS public.admin_list_tasks(jsonb, integer, integer);

DROP FUNCTION IF EXISTS public.trigger_waterfall_recompute();
DROP FUNCTION IF EXISTS public.recompute_project_dates_waterfall(uuid);
DROP FUNCTION IF EXISTS public.recompute_subtree_waterfall(uuid, date);
