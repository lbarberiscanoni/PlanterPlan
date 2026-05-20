-- Extend the planter.deleting_project_root GUC skip to the other two
-- audit triggers: log_member_change and log_comment_change. Both fire
-- during the cascade of a project-root DELETE (project_members has FK
-- on project_id, task_comments references tasks via task_id) and
-- both INSERT into activity_log with project_id = the deleted root,
-- producing the same 23503 FK violation that log_task_change does.

CREATE OR REPLACE FUNCTION public.log_member_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_action  text;
  v_payload jsonb;
  v_project_id uuid;
  v_skip_root text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'member_added';
    v_payload := jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role);
  ELSIF TG_OP = 'UPDATE' AND OLD.role IS DISTINCT FROM NEW.role THEN
    v_action  := 'member_role_changed';
    v_payload := jsonb_build_object('user_id', NEW.user_id, 'from', OLD.role, 'to', NEW.role);
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'member_removed';
    v_payload := jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role);
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  IF TG_OP = 'DELETE' THEN
    v_skip_root := current_setting('planter.deleting_project_root', true);
    IF v_skip_root IS NOT NULL
       AND v_skip_root <> ''
       AND v_skip_root = v_project_id::text
    THEN
      RETURN OLD;
    END IF;
  END IF;

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_project_id, auth.uid(), 'member', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;


CREATE OR REPLACE FUNCTION public.log_comment_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_action  text;
  v_payload jsonb;
  v_project_id uuid;
  v_skip_root text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action  := 'comment_posted';
    v_payload := jsonb_build_object('task_id', NEW.task_id, 'body_preview', substring(NEW.body, 1, 140));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action  := 'comment_deleted';
      v_payload := jsonb_build_object('task_id', NEW.task_id);
    ELSIF NEW.body IS DISTINCT FROM OLD.body THEN
      v_action  := 'comment_edited';
      v_payload := jsonb_build_object('task_id', NEW.task_id, 'body_preview', substring(NEW.body, 1, 140));
    ELSE
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action  := 'comment_deleted';
    v_payload := jsonb_build_object('task_id', OLD.task_id);
  END IF;

  v_project_id := COALESCE(NEW.root_id, OLD.root_id);

  IF TG_OP = 'DELETE' THEN
    v_skip_root := current_setting('planter.deleting_project_root', true);
    IF v_skip_root IS NOT NULL
       AND v_skip_root <> ''
       AND v_skip_root = v_project_id::text
    THEN
      RETURN OLD;
    END IF;
  END IF;

  INSERT INTO public.activity_log (project_id, actor_id, entity_type, entity_id, action, payload)
  VALUES (v_project_id, auth.uid(), 'comment', COALESCE(NEW.id, OLD.id), v_action, v_payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;
