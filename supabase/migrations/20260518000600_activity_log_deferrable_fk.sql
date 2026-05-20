-- Make the activity_log → tasks FK DEFERRABLE INITIALLY DEFERRED.
--
-- Why: even after the 000300/000400 fixes that try to skip log inserts
-- when the root no longer exists in tasks, the cascade DELETE on a
-- project still surfaces 23503 because the inner row triggers fire
-- before the cascade's CASCADE-action on activity_log finishes wiping
-- the orphaned log rows. By deferring the FK check to COMMIT time, the
-- cascade has time to delete both the activity_log rows pointing at the
-- old root AND the freshly-inserted ones from log_task_change for the
-- cascaded children — leaving no FK violations to check at commit.

ALTER TABLE public.activity_log
    DROP CONSTRAINT IF EXISTS activity_log_project_id_fkey;

ALTER TABLE public.activity_log
    ADD CONSTRAINT activity_log_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.tasks(id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
