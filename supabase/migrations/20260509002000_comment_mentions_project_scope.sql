-- PR 9: keep mention notifications scoped to project members.
--
-- `task_comments.mentions` is client-supplied text[], so the trigger must
-- enforce the notification recipient boundary itself. Without this guard, a
-- project member could enqueue a comment-preview notification for an arbitrary
-- UUID that is not a current project member.

CREATE OR REPLACE FUNCTION public.enqueue_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_invalid_count integer;
  v_nonmember_count integer := 0;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.author_id IS NULL THEN
    RAISE WARNING 'enqueue_comment_mentions skipped comment % because author_id is null', NEW.id;
    RETURN NEW;
  END IF;

  SELECT count(*)
    INTO v_invalid_count
  FROM unnest(NEW.mentions) AS t
  WHERE t IS NOT NULL
    AND t !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  IF v_invalid_count > 0 THEN
    RAISE WARNING 'enqueue_comment_mentions ignored % non-uuid mention value(s) for comment %', v_invalid_count, NEW.id;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT t::uuid
    FROM unnest(NEW.mentions) AS t
    WHERE t IS NOT NULL
      AND t ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      AND t::uuid <> NEW.author_id
  LOOP
    IF NOT public.is_active_member(NEW.root_id, v_user_id) THEN
      v_nonmember_count := v_nonmember_count + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.notification_log (user_id, channel, event_type, payload)
    VALUES (
      v_user_id,
      'email',
      'mention_pending',
      jsonb_build_object(
        'recipient_id', v_user_id,
        'actor_id', NEW.author_id,
        'author_id', NEW.author_id,
        'comment_id', NEW.id,
        'task_id', NEW.task_id,
        'project_id', NEW.root_id,
        'root_id', NEW.root_id,
        'body_preview', substring(NEW.body, 1, 140)
      )
    );
  END LOOP;

  IF v_nonmember_count > 0 THEN
    RAISE WARNING 'enqueue_comment_mentions ignored % non-project-member mention value(s) for comment %', v_nonmember_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_comment_mentions() FROM PUBLIC;
