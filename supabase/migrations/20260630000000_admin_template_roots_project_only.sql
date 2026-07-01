-- admin_template_roots() listed every parent-less template row, so loose Master
-- Library items (a phase or task saved with parent_task_id = NULL, task_type <>
-- 'project') showed up in /admin/templates as if they were top-level templates.
-- Tim flagged this in the 2026-06-30 review: "if it's supposed to be a phase, it
-- shouldn't appear as a template — only the top-level template item should."
--
-- The sibling admin_library_templates() RPC already gates on
-- COALESCE(task_type,'project') = 'project'; admin_template_roots never got the
-- same clause. Add it so only true project-template roots list here. Loose items
-- remain reachable via admin_library_items() / the /admin/library surface.
CREATE OR REPLACE FUNCTION public.admin_template_roots()
    RETURNS TABLE(id uuid, title text, template_version integer, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    RETURN QUERY
    SELECT t.id, t.title, COALESCE(t.template_version, 1), t.updated_at
    FROM public.tasks t
    WHERE t.parent_task_id IS NULL
      AND t.origin = 'template'
      AND COALESCE(t.task_type, 'project') = 'project'
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC;
END;
$$;
