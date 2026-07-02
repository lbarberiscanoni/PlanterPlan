-- Logical split of the shared `tasks` table (2026-07-01). PURELY ADDITIVE:
-- two read-only, RLS-respecting views that name the two halves of the tree, so
-- code/SQL can stop re-deriving `parent_task_id IS NULL` and stop treating a
-- project as a generic task. Nothing existing is altered — no table, column,
-- policy, trigger, or function is touched.
--
--   public.projects   = root tasks       (parent_task_id IS NULL)  -> PROJECT_STATUS
--   public.task_items = non-root tasks    (parent_task_id NOT NULL) -> TASK_STATUS
--
-- security_invoker=true: the querying user's RLS on public.tasks applies, so
-- these views leak nothing the user couldn't already read (matches
-- tasks_with_primary_resource).
--
-- FULLY REVERTIBLE — to roll back, run:
--   DROP VIEW IF EXISTS public.projects;
--   DROP VIEW IF EXISTS public.task_items;

CREATE OR REPLACE VIEW public.projects
  WITH (security_invoker = true) AS
  SELECT * FROM public.tasks WHERE parent_task_id IS NULL;

CREATE OR REPLACE VIEW public.task_items
  WITH (security_invoker = true) AS
  SELECT * FROM public.tasks WHERE parent_task_id IS NOT NULL;

GRANT SELECT ON public.projects   TO authenticated;
GRANT SELECT ON public.task_items TO authenticated;
