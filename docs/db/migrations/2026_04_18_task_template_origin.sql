-- Wave 36 Task 2 — Template origin tracking on cloned tasks
--
-- Adds `cloned_from_task_id uuid` on `public.tasks`. The column is
-- populated by the patched `clone_project_template` RPC shipped in the
-- adjacent `2026_04_18_clone_rpc_wave36_patch.sql` migration (required for
-- the app-side delete guard to ever fire). NULL means
-- "post-instantiation custom addition" — owners can freely delete those.
-- NOT-NULL rows are template-origin; the Wave 36 UI guard blocks deletes
-- for non-owners.
--
-- Additive only.
--
-- Backfill: all existing rows get NULL (we don't have provenance pre-Wave-36).
-- The UI guard treats NULL as "custom addition" by design; in production this
-- means every task created before the migration is freely deletable (by
-- anyone with the project-level delete permission), which matches pre-Wave-36
-- behavior exactly.

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS cloned_from_task_id uuid
        REFERENCES public.tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_cloned_from_task_id
    ON public.tasks (cloned_from_task_id)
    WHERE cloned_from_task_id IS NOT NULL;

COMMENT ON COLUMN public.tasks.cloned_from_task_id IS
    'Wave 36 — stamped during clone_project_template for every cloned descendant. Points to the source template task. NULL on pre-Wave-36 rows and on post-instantiation additions. App-layer UI guard in TaskDetailsView warns non-owners before deleting a template-origin task; owners can delete freely.';
