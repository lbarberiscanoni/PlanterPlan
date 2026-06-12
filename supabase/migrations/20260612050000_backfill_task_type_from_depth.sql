-- DRAFT (for review — not yet applied). One-time backfill: re-sync task_type to
-- depth across all existing rows, repairing the historical drift described in
-- 20260612040000_retype_descendants_on_move.sql.
--
-- Run this AFTER the cascading-retype trigger migration so no new drift is
-- introduced between repair and fix. Depth is the intended source of truth (the
-- whole task_type system is derive_task_type(parent_task_id)); this statement sets
-- every row to that derived value.
--
-- PRESERVED EXCEPTION — loose master-library items: a parent-less template row may
-- carry an explicitly-assigned phase/milestone/task type (see set_task_type() and
-- 20260612000000_master_library_loose_items.sql). derive_task_type() would force
-- those depth-0 roots to 'project', so they are excluded from the backfill, exactly
-- as the live trigger excludes them.
--
-- Expected impact (live prod dry-run, 2026-06-12, inlining derive_task_type's
-- depth logic over the whole forest): 1854 of 4837 rows change, across 28 projects,
-- of which 133 are template rows. By shift type: 1434 cross a grouping boundary
-- (phase->task 459, milestone->task 353, milestone->subtask 207, task->milestone
-- 184, phase->milestone 132, phase->subtask 84, task->phase 15) and 420 are benign
-- leaf<->leaf (task<->subtask). The grouping-affecting majority confirms the drift
-- is the real cause of the mis-grouped projects, not a cosmetic edge case.
--
-- Triggers are disabled for the duration so the backfill does not spam activity_log,
-- bump template_version, or churn updated_at — this is a derived-column correction,
-- not a user edit. Requires table ownership (migrations run as postgres). The
-- statement is idempotent: re-running changes nothing once rows match depth.

ALTER TABLE public.tasks DISABLE TRIGGER USER;

UPDATE public.tasks t
SET task_type = public.derive_task_type(t.parent_task_id)
WHERE NOT (
        t.parent_task_id IS NULL
        AND t.origin = 'template'
        AND lower(t.task_type) IN ('phase', 'milestone', 'task')
      )
  AND t.task_type IS DISTINCT FROM public.derive_task_type(t.parent_task_id);

ALTER TABLE public.tasks ENABLE TRIGGER USER;
