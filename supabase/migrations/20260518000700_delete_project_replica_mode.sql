-- Rewrite delete_project to suppress user-row triggers during cascade.
--
-- Why: even with SECURITY DEFINER + DEFERRABLE FK, the AFTER DELETE
-- log_task_change trigger fires on every cascade-deleted descendant
-- and INSERTs a new activity_log row pointing at the project root
-- that's already been deleted in the same statement. These newly
-- inserted rows are NOT cleaned up by the FK CASCADE (which runs
-- before the AFTER triggers do their inserts), so they fail the FK
-- check at commit time even with the constraint deferred.
--
-- session_replication_role = 'replica' tells Postgres to skip user
-- row-level triggers (BEFORE/AFTER, INSERT/UPDATE/DELETE) for the
-- current session only. FK constraint triggers ARE system triggers
-- and continue to fire, so ON DELETE CASCADE still wipes the tasks
-- subtree, task_resources, project_members, activity_log, etc.
--
-- SET LOCAL scopes the change to this function call; nothing leaks
-- to concurrent sessions or to the caller after the RPC returns.

CREATE OR REPLACE FUNCTION public.delete_project(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_root public.tasks%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Access denied: not authenticated.'
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_root
    FROM public.tasks
    WHERE id = p_project_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Project % not found.', p_project_id
            USING ERRCODE = 'P0002';
    END IF;

    IF v_root.parent_task_id IS NOT NULL THEN
        RAISE EXCEPTION 'delete_project only accepts project roots (parent_task_id IS NULL). Got %.', p_project_id
            USING ERRCODE = '22023';
    END IF;

    IF NOT (
        public.is_admin(v_actor_id)
        OR public.has_project_role(p_project_id, v_actor_id, ARRAY['planter']::text[])
    ) THEN
        RAISE EXCEPTION 'Access denied: requires admin or Planter role on this project.'
            USING ERRCODE = '42501';
    END IF;

    SET LOCAL session_replication_role = 'replica';
    DELETE FROM public.tasks WHERE id = p_project_id;

    RETURN jsonb_build_object('deleted_project_id', p_project_id);
END;
$$;

ALTER FUNCTION public.delete_project(uuid) OWNER TO postgres;
