-- Wave completion remediation
--
-- Closes post-wave audit findings from Waves 30, 34, 35, and 36:
--   * mention payloads carry root_id so notification links route to /project/:rootId
--   * admin task/template reads move behind admin-gated SECURITY DEFINER RPCs
--   * schema source-of-truth keeps the unsafe clone overloads dropped

DROP FUNCTION IF EXISTS public.clone_project_template(uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.clone_project_template(uuid, uuid, text, uuid, text, text, date, date);

CREATE OR REPLACE FUNCTION public.enqueue_comment_mentions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF NEW.mentions IS NULL OR array_length(NEW.mentions, 1) IS NULL THEN
    RETURN NEW;
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
        'comment_id', NEW.id,
        'task_id', NEW.task_id,
        'root_id', NEW.root_id,
        'author_id', NEW.author_id,
        'body_preview', substring(NEW.body, 1, 140)
      )
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_comment_mentions() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.admin_search_root_tasks(
    p_query text,
    p_origin text DEFAULT NULL,
    p_max_results int DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    title text,
    origin text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_pattern text;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF p_query IS NULL OR char_length(trim(p_query)) < 2 THEN
        RETURN;
    END IF;

    IF p_origin IS NOT NULL AND p_origin NOT IN ('instance', 'template') THEN
        RAISE EXCEPTION 'invalid origin filter: %', p_origin;
    END IF;

    v_pattern := '%' ||
        replace(
            replace(
                replace(trim(p_query), '\', '\\'),
                '%', '\%'
            ),
            '_', '\_'
        ) || '%';

    RETURN QUERY
    SELECT t.id, t.title, t.origin
    FROM public.tasks t
    WHERE t.parent_task_id IS NULL
      AND t.origin IN ('instance', 'template')
      AND (p_origin IS NULL OR t.origin = p_origin)
      AND COALESCE(t.title, '') ILIKE v_pattern ESCAPE '\'
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC
    LIMIT GREATEST(1, LEAST(COALESCE(p_max_results, 10), 100));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_root_tasks(text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_search_root_tasks(text, text, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_template_roots()
RETURNS TABLE (
    id uuid,
    title text,
    template_version int,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    RETURN QUERY
    SELECT t.id, t.title, COALESCE(t.template_version, 1), t.updated_at
    FROM public.tasks t
    WHERE t.parent_task_id IS NULL
      AND t.origin = 'template'
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_template_roots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_template_roots() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_template_clones(p_template_id uuid)
RETURNS TABLE (
    project_id uuid,
    title text,
    cloned_from_template_version int,
    current_template_version int,
    stale boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_current_version int;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    SELECT COALESCE(t.template_version, 1)
    INTO v_current_version
    FROM public.tasks t
    WHERE t.id = p_template_id
      AND t.parent_task_id IS NULL
      AND t.origin = 'template';

    IF v_current_version IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        i.id,
        i.title,
        CASE
            WHEN jsonb_typeof(i.settings -> 'cloned_from_template_version') = 'number'
                THEN (i.settings ->> 'cloned_from_template_version')::int
            ELSE NULL
        END AS cloned_from_template_version,
        v_current_version AS current_template_version,
        CASE
            WHEN jsonb_typeof(i.settings -> 'cloned_from_template_version') = 'number'
                THEN (i.settings ->> 'cloned_from_template_version')::int < v_current_version
            ELSE false
        END AS stale
    FROM public.tasks i
    WHERE i.parent_task_id IS NULL
      AND i.origin = 'instance'
      AND i.settings ->> 'spawnedFromTemplate' = p_template_id::text
    ORDER BY i.updated_at DESC NULLS LAST, i.title ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_template_clones(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_template_clones(uuid) TO authenticated;

