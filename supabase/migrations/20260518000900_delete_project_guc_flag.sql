-- Final, working approach: a session GUC that the RPC sets to mark
-- "I'm in the middle of deleting this project root," and the
-- log_task_change trigger consults to skip log inserts for the
-- corresponding subtree.
--
-- Why the earlier fixes didn't land:
--   * 000300/000400's `NOT EXISTS (SELECT 1 FROM tasks ...)` check in
--     the AFTER trigger fails because PL/pgSQL queries inside a
--     trigger fired by the same statement use a snapshot that
--     doesn't see the statement's in-progress deletions — the root
--     "still exists" from the trigger's point of view even though
--     it's been deleted moments earlier in the same statement.
--   * 000600's DEFERRABLE FK pushed the check to commit, but the
--     newly-inserted log rows survive cascade and trip the
--     constraint anyway.
--   * 000700's session_replication_role = 'replica' is locked down
--     for the Supabase postgres role.
--   * 000800's EXCEPTION block can't fire because the FK is
--     deferred — there's no error to catch at INSERT time.
--
-- The GUC approach is the standard Postgres pattern for "telling a
-- trigger that the caller is doing something special." SET LOCAL
-- scopes the flag to the transaction; nothing leaks.

-- Revert the FK to its original IMMEDIATE form. The trigger guard
-- below is the correctness fix; keeping the FK deferred would only
-- add latency without benefit.
ALTER TABLE public.activity_log
    DROP CONSTRAINT IF EXISTS activity_log_project_id_fkey;

ALTER TABLE public.activity_log
    ADD CONSTRAINT activity_log_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

-- Updated trigger: consult the planter.deleting_project_root GUC and
-- skip the log insert when the row being deleted belongs to the
-- project being deleted.
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
  v_skip_root  text;
BEGIN
  -- Project-root deletes: nothing to log against.
  IF TG_OP = 'DELETE' AND OLD.parent_task_id IS NULL THEN
    RETURN OLD;
  END IF;

  v_project_id := COALESCE(NEW.root_id, OLD.root_id, NEW.id, OLD.id);

  -- delete_project sets this GUC to the root_id it's tearing down.
  -- Skip the audit row for every cascade-deleted descendant whose
  -- root_id matches — those rows' project would be a dangling FK
  -- (the root is already deleted by the time we get here).
  IF TG_OP = 'DELETE' THEN
    v_skip_root := current_setting('planter.deleting_project_root', true);
    IF v_skip_root IS NOT NULL
       AND v_skip_root <> ''
       AND v_skip_root = v_project_id::text
    THEN
      RETURN OLD;
    END IF;
  END IF;

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

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_project_id, auth.uid(), 'task', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Updated RPC: set the GUC before issuing the cascade DELETE so
-- log_task_change knows which subtree to skip.
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

    PERFORM set_config('planter.deleting_project_root', p_project_id::text, true);
    DELETE FROM public.tasks WHERE id = p_project_id;

    RETURN jsonb_build_object('deleted_project_id', p_project_id);
END;
$$;

ALTER FUNCTION public.delete_project(uuid) OWNER TO postgres;
