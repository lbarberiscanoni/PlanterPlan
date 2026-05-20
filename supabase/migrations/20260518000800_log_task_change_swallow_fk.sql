-- Final fix in the trigger chain: swallow FK violations inside
-- log_task_change.
--
-- Why: 000300/000400 tried to skip the activity_log INSERT when the
-- project root no longer exists. That check works only if the AFTER
-- trigger's snapshot sees the cascaded root as already deleted —
-- which it doesn't, because Postgres fires AFTER-row triggers on the
-- cascade-deleted children before the FK CASCADE action wipes the
-- root's activity_log rows. 000600 made the FK DEFERRABLE so checks
-- happen at commit, but the newly-inserted log rows still survive
-- past commit and trip the constraint.
--
-- session_replication_role is locked down in Supabase, so we can't
-- mute user triggers from the RPC.
--
-- The simplest robust fix: catch the FK violation in the trigger
-- itself. Activity_log rows for a project being deleted are about to
-- vanish via CASCADE anyway, so suppressing the log entry is
-- consistent with the post-delete steady state.

CREATE OR REPLACE FUNCTION public.log_task_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_project_id uuid;
  v_action     text;
  v_payload    jsonb := '{}'::jsonb;
  v_changed    text[];
BEGIN
  -- Project-root deletes: nothing to log against.
  IF TG_OP = 'DELETE' AND OLD.parent_task_id IS NULL THEN
    RETURN OLD;
  END IF;

  v_project_id := COALESCE(NEW.root_id, OLD.root_id, NEW.id, OLD.id);

  IF TG_OP = 'INSERT' THEN
    v_action  := 'created';
    v_payload := jsonb_build_object(
      'title', NEW.title,
      'parent_task_id', NEW.parent_task_id,
      'status', NEW.status
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_action  := 'status_changed';
      v_payload := jsonb_build_object('from', OLD.status, 'to', NEW.status);
    ELSE
      v_action := 'updated';
      v_changed := ARRAY[]::text[];
      IF NEW.title       IS DISTINCT FROM OLD.title       THEN v_changed := array_append(v_changed, 'title'); END IF;
      IF NEW.description IS DISTINCT FROM OLD.description THEN v_changed := array_append(v_changed, 'description'); END IF;
      IF NEW.start_date  IS DISTINCT FROM OLD.start_date  THEN v_changed := array_append(v_changed, 'start_date'); END IF;
      IF NEW.due_date    IS DISTINCT FROM OLD.due_date    THEN v_changed := array_append(v_changed, 'due_date'); END IF;
      IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN v_changed := array_append(v_changed, 'assignee_id'); END IF;
      IF array_length(v_changed, 1) IS NULL THEN
        RETURN COALESCE(NEW, OLD);
      END IF;
      v_payload := jsonb_build_object('changed_keys', v_changed);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'deleted';
    v_payload := jsonb_build_object('title', OLD.title);
  END IF;

  BEGIN
    INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
    VALUES (v_project_id, auth.uid(), 'task', COALESCE(NEW.id, OLD.id), v_action, v_payload);
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Project root was deleted in the same transaction. The audit
      -- entry would be unreachable from the (also-deleted) project's
      -- activity feed; safe to drop.
      NULL;
  END;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Drop the failing SET LOCAL session_replication_role from
-- delete_project — Supabase's postgres role can't change that
-- parameter at runtime, so 000700 broke the RPC. With the trigger
-- exception above, the plain SECURITY DEFINER cascade DELETE
-- completes cleanly.

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
