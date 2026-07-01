-- Normalize genuinely-legacy `tasks.status` values, surfaced by the 2026-07-01
-- audit. IMPORTANT: `tasks.status` carries TWO vocabularies by depth:
--   * leaf tasks  -> TASK_STATUS:    todo, in_progress, blocked, completed, na
--   * root tasks  -> PROJECT_STATUS: planning, in_progress, launched, paused, archived
-- So planning / launched / paused / archived on ROOTS are VALID project
-- lifecycle states and are deliberately left alone.
--
-- Only two things are actually wrong:
--
-- 1. `not_started` — the leaf-task status that predates `todo` (the app no
--    longer writes it; creation defaults to `todo`). 1391 leaf rows, invisible
--    to the report status cards. Map to `todo`. Guarded to leaves only.
UPDATE public.tasks
   SET status = 'todo'
 WHERE status = 'not_started' AND parent_task_id IS NOT NULL;

-- 2. Two old test-project ROOTS whose status is outside BOTH vocabularies
--    ('complete' and ''). Map to the nearest valid PROJECT_STATUS.
UPDATE public.tasks
   SET status = 'launched'
 WHERE status = 'complete' AND parent_task_id IS NULL;

UPDATE public.tasks
   SET status = 'planning'
 WHERE (status = '' OR status IS NULL) AND parent_task_id IS NULL;

-- No CHECK constraint here: a correct guard must be depth-aware (root vs leaf
-- use different vocabularies), which needs its own design + a full write-path
-- audit. Tracked as a follow-up.
