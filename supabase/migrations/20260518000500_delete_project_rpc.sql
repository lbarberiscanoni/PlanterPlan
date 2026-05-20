-- SECURITY DEFINER RPC for project deletion.
--
-- Why an RPC: a direct DELETE on public.tasks for a cloned project root
-- has to thread through two BEFORE/AFTER trigger chains that fire on
-- every cascaded descendant (enforce_template_scaffold_immutability,
-- log_task_change). The scaffold-immutability trigger blocks every
-- descendant DELETE (cloned_from_task_id IS NOT NULL + parent_task_id
-- IS NOT NULL), so cascade can never complete from the authenticated
-- role. Running the delete inside a SECURITY DEFINER function owned by
-- postgres triggers the existing service-role bypass in
-- enforce_template_scaffold_immutability and lets the FK cascade clean
-- up the entire subtree in one statement.
--
-- Authorization: callers must be admin or the project's Planter — same
-- gate that ProjectHeader uses to render the Danger Zone (`canManageSettings`).

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

    DELETE FROM public.tasks WHERE id = p_project_id;

    RETURN jsonb_build_object('deleted_project_id', p_project_id);
END;
$$;

ALTER FUNCTION public.delete_project(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_project(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_project(uuid) TO authenticated;
