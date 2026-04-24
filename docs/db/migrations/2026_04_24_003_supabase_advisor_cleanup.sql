-- Supabase advisor cleanup after Wave 30-36 catch-up
--
-- Keeps the deployed project and schema source-of-truth aligned with the
-- advisor fixes applied during remediation: fixed function search_path values,
-- missing FK support indexes, and duplicate-index removal.

ALTER FUNCTION public.check_phase_unlock() SET search_path TO '';
ALTER FUNCTION public.handle_phase_completion() SET search_path TO '';
ALTER FUNCTION public.has_project_role(uuid, uuid, text[]) SET search_path TO '';
ALTER FUNCTION public.rag_get_project_context(uuid, integer) SET search_path TO '';

CREATE INDEX IF NOT EXISTS idx_activity_log_actor_id
    ON public.activity_log (actor_id)
    WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_comments_author_id
    ON public.task_comments (author_id);

CREATE INDEX IF NOT EXISTS idx_task_relationships_project_id
    ON public.task_relationships (project_id);

CREATE INDEX IF NOT EXISTS idx_task_relationships_to_task_id
    ON public.task_relationships (to_task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_project_id
    ON public.tasks (parent_project_id)
    WHERE parent_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_prerequisite_phase_id
    ON public.tasks (prerequisite_phase_id)
    WHERE prerequisite_phase_id IS NOT NULL;

DROP INDEX IF EXISTS public.task_resources_task_id_idx;
