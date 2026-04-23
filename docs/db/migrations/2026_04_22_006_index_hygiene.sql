-- Post-megabatch: index hygiene
--
-- DB-18: `tasks.primary_resource_id` is a FK to `task_resources.id` but has
-- no supporting index. Any delete of a task_resources row scans `tasks`
-- for referencing rows (O(n) on the table). On a large tenant this is a
-- pain point.
--
-- DB-19: `tasks.parent_task_id` and `tasks.root_id` each have TWO indexes
-- under slightly different names (idx_tasks_parent / idx_tasks_parent_id,
-- idx_tasks_root / idx_tasks_root_id). The duplicates double every
-- INSERT/UPDATE's index-maintenance cost without any read benefit.
--
-- Additive + idempotent.

-- DB-18 — cover the FK lookup. Partial index to keep size small since
-- most tasks have no primary resource.
CREATE INDEX IF NOT EXISTS idx_tasks_primary_resource_id
    ON public.tasks (primary_resource_id)
    WHERE primary_resource_id IS NOT NULL;

-- DB-19 — drop the less-canonical of each duplicate pair. Keep
-- idx_tasks_parent_id and idx_tasks_root_id (the `_id` suffix matches
-- the column name convention).
DROP INDEX IF EXISTS public.idx_tasks_parent;
DROP INDEX IF EXISTS public.idx_tasks_root;

-- DB-20 (follow-up): partial index for the dispatch-notifications claim
-- path. The dispatcher scans notification_log every minute looking for
-- `event_type = 'mention_pending'` rows; a partial index shrinks the
-- scanned set to just the pending queue.
CREATE INDEX IF NOT EXISTS idx_notification_log_pending
    ON public.notification_log (id)
    WHERE event_type = 'mention_pending';
