-- One-time backfill: repair task_type on instance rows corrupted by the pre-fix
-- clone_project_template (see 20260710000000_fix_clone_task_type_derivation.sql).
--
-- Every project cloned before that fix has phase/milestone rows mis-typed (tree
-- shifted one level shallow), which dumps them into the /tasks "Other" bucket and
-- shows them as loose actionable tasks. Re-derive task_type from each row's
-- structural depth now that the full tree exists.
--
-- Safe: this is a task_type-only UPDATE.
--   * trg_set_task_type fires only on UPDATE OF parent_task_id -> not re-fired.
--   * The date/envelope triggers fire only on UPDATE OF start_date/due_date/
--     duration/parent_task_id -> dates are untouched.
-- Scoped to origin='instance', so template scaffolds (correct, and protected by
-- the loose-master-library exception in set_task_type) are never touched.
-- Idempotent via the IS DISTINCT FROM guard (re-running changes nothing).
UPDATE public.tasks t
SET task_type = public.derive_task_type(t.parent_task_id)
WHERE t.origin = 'instance'
  AND t.task_type IS DISTINCT FROM public.derive_task_type(t.parent_task_id);
