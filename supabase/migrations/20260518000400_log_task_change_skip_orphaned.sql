-- Extend the project-root carve-out in log_task_change to cover cascade
-- deletes of descendants.
--
-- Why 000300 wasn't enough: when a project root is deleted, Postgres
-- runs ON DELETE CASCADE through tasks.parent_task_id, firing
-- log_task_change AFTER DELETE for every descendant. Each descendant
-- tries to INSERT an activity_log row with project_id = OLD.root_id,
-- which points at the root that's already been removed in the same
-- statement (AFTER triggers see post-cascade state). Result: the same
-- 23503 FK violation we saw on the root itself, just from a child row.
--
-- Fix: on DELETE, if the target project_id no longer exists in tasks,
-- skip the log INSERT. The cascade has already wiped every other log
-- row for this project, so the missing entry is consistent with the
-- post-delete state.

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

  -- Cascade-delete of a descendant whose project root has already been
  -- removed: the activity_log FK would fail and the project's log rows
  -- are about to be cascade-deleted anyway. Skip silently.
  IF TG_OP = 'DELETE'
     AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE id = v_project_id)
  THEN
    RETURN OLD;
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
