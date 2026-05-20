-- Skip the activity_log INSERT when an AFTER DELETE trigger fires on a
-- project root.
--
-- Bug context: log_task_change runs AFTER INSERT OR UPDATE OR DELETE on
-- public.tasks. On DELETE it computes v_project_id =
-- COALESCE(NEW.root_id, OLD.root_id, NEW.id, OLD.id) — for project roots
-- OLD.root_id = OLD.id, so the insert points at the row we just deleted.
-- activity_log.project_id has a FK to tasks(id) ON DELETE CASCADE; by the
-- time this AFTER trigger fires the cascade has already removed the
-- target, and Postgres rejects the new row with 23503 (409 to the client):
--   "insert or update on table activity_log violates foreign key
--    constraint activity_log_project_id_fkey"
--
-- Fix: when DELETE-ing a row that is its own project (parent_task_id IS
-- NULL), skip the log insert. The CASCADE wipes every existing log row
-- for this project anyway, so a deletion entry would be unreachable from
-- the project's activity feed.

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
  -- Project-root deletes: nothing to log against (the project's entire
  -- activity feed is about to be cascade-deleted with this row).
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

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_project_id, auth.uid(), 'task', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;
