-- Unified delete RPC for every node in the tasks tree.
--
-- Replaces the project-only `delete_project(uuid)` with `delete_task(uuid)`
-- so all four flows from Tim's spec route through a single path:
--   * Delete project root          (Planter or Admin, origin='instance')
--   * Delete template root         (Admin only, origin='template')
--   * Nested delete in a project   (Planter or Admin, descendant of instance)
--   * Nested delete in a template  (Admin only, descendant of template)
--
-- Diagnostic findings (2026-05-26) showed the prior `delete_project` on prod
-- didn't match source — calling it returned bare "Access denied" P0001 for
-- planters and "Project has no start_date" for admins, neither of which any
-- migration in source raises. This `CREATE OR REPLACE` overwrites whatever
-- is there. `DROP FUNCTION ... delete_project` at the bottom removes the
-- legacy entry point so the client can't accidentally call the old version.
--
-- The SECURITY DEFINER + postgres owner combination triggers the existing
-- bypass branch in enforce_template_scaffold_immutability
-- (`current_user IN ('postgres', 'supabase_admin', 'service_role')`), so
-- cascade deletes through scaffold descendants proceed cleanly.
--
-- For root deletes, the `planter.deleting_project_root` GUC suppresses the
-- three audit-trigger inserts (log_task_change / log_member_change /
-- log_comment_change) that would otherwise violate the activity_log FK
-- after the root row is gone. Non-root deletes leave the GUC unset so
-- audit entries land normally.

CREATE OR REPLACE FUNCTION public.delete_task(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_row public.tasks%ROWTYPE;
    v_root_id uuid;
    v_is_root boolean;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: not authenticated.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_row
    FROM public.tasks
    WHERE id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Task % not found.', p_task_id
            USING ERRCODE = 'P0002';
    END IF;

    v_root_id := COALESCE(v_row.root_id, v_row.id);
    v_is_root := v_row.parent_task_id IS NULL;

    -- Authorization split: templates are admin-only at every depth;
    -- instance rows accept admin OR Planter on the owning project.
    IF v_row.origin = 'template' THEN
        IF NOT public.is_admin(v_actor_id) THEN
            RAISE EXCEPTION 'Access denied: only admins can delete template tasks.'
                USING ERRCODE = '42501';
        END IF;
    ELSE
        IF NOT (
            public.is_admin(v_actor_id)
            OR public.has_permission(v_root_id, v_actor_id, 'planter')
        ) THEN
            RAISE EXCEPTION 'Access denied: requires admin or Planter role on this project.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Root deletes cascade-wipe the entire project/template; the audit
    -- triggers would otherwise try to log against the now-deleted root.
    -- Setting this GUC tells them to skip those inserts. SET LOCAL keeps
    -- the flag scoped to this function's transaction.
    IF v_is_root THEN
        PERFORM set_config('planter.deleting_project_root', v_root_id::text, true);
    END IF;

    DELETE FROM public.tasks WHERE id = p_task_id;

    RETURN jsonb_build_object(
        'deleted_task_id', p_task_id,
        'was_root', v_is_root,
        'root_id', v_root_id
    );
END;
$$;

ALTER FUNCTION public.delete_task(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_task(uuid) TO authenticated;

-- Legacy entry point. Drop after defining the replacement so the client
-- migration window has both available momentarily, but no callers should
-- be left after this migration ships alongside the client change.
DROP FUNCTION IF EXISTS public.delete_project(uuid);

COMMENT ON FUNCTION public.delete_task(uuid) IS
    'Unified delete for any node in public.tasks. Routes both root (project/template) and descendant deletes through one SECURITY DEFINER path; admin-only for template nodes, admin-or-Planter for instance nodes. Sets planter.deleting_project_root GUC on root deletes so audit triggers skip their post-cascade INSERT.';
