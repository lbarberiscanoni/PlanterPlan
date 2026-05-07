-- PR 7: comment author hydration and mention notification hardening.
--
-- The client previously selected task_comments with author:users(...) across
-- the public/auth schema boundary. Generated Supabase types cannot represent
-- that join reliably, and runtime failures degraded to author:null. This RPC
-- performs the auth.users join inside a gated SECURITY DEFINER function and
-- returns an explicit DTO shape for client normalization.

CREATE OR REPLACE FUNCTION public.list_task_comments_with_authors(
  p_task_id uuid,
  p_comment_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  task_id uuid,
  root_id uuid,
  parent_comment_id uuid,
  author_id uuid,
  body text,
  mentions text[],
  created_at timestamptz,
  updated_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  author jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_root_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized: authenticated user required'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(t.root_id, t.id)
    INTO v_root_id
  FROM public.tasks AS t
  WHERE t.id = p_task_id;

  IF v_root_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (
    public.is_active_member(v_root_id, v_actor_id)
    OR public.is_admin(v_actor_id)
  ) THEN
    RAISE EXCEPTION 'unauthorized: project membership required'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.task_id,
    c.root_id,
    c.parent_comment_id,
    c.author_id,
    c.body,
    c.mentions,
    c.created_at,
    c.updated_at,
    c.edited_at,
    c.deleted_at,
    CASE
      WHEN u.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'user_metadata', COALESCE(u.raw_user_meta_data, '{}'::jsonb)
      )
    END AS author
  FROM public.task_comments AS c
  LEFT JOIN auth.users AS u ON u.id = c.author_id
  WHERE c.task_id = p_task_id
    AND (p_comment_id IS NULL OR c.id = p_comment_id)
  ORDER BY c.created_at ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_task_comments_with_authors(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_task_comments_with_authors(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.list_task_comments_with_authors(uuid, uuid) IS
  'Project-member/admin gated task comment reader that hydrates auth.users author metadata without fragile cross-schema PostgREST joins.';

CREATE OR REPLACE FUNCTION public.enqueue_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid;
  v_invalid_count integer;
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_comment_mentions() FROM PUBLIC;
