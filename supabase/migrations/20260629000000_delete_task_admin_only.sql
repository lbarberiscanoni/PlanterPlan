-- Restrict task/project deletion to global Admins.
--
-- Prior behavior (20260519000100_unified_delete_task_rpc.sql) allowed a project
-- Planter to delete instance rows (subtasks and roots alike). Product decision
-- (2026-06-29): Planters and Team members must NOT delete. They retire a task
-- by setting its status to 'na' (N/A) instead; only P4P Admins may destroy a
-- row and, for roots, cascade-wipe the project subtree.
--
-- This collapses the previous origin-based authorization split into a single
-- admin check: templates were already admin-only, and instances now match.
-- Everything else (root-cascade GUC, owner/grants, audit-trigger suppression)
-- is preserved verbatim from the prior definition.

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

    -- Deletion is Admin-only at every depth, for both template and instance
    -- rows. Planters/Team retire tasks via the 'na' status, never DELETE.
    IF NOT public.is_admin(v_actor_id) THEN
        RAISE EXCEPTION 'Access denied: only admins can delete tasks.'
            USING ERRCODE = '42501';
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

COMMENT ON FUNCTION public.delete_task(uuid) IS
    'Unified delete for any node in public.tasks. Admin-only at every depth for both template and instance rows (Planters/Team retire tasks via the ''na'' status). Sets planter.deleting_project_root GUC on root deletes so audit triggers skip their post-cascade INSERT.';
