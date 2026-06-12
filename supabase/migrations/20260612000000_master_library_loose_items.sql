-- Master Library — loose library items + admin read RPCs
--
-- Phase 0 of the admin-dashboard expansion. The Master Library reuses the
-- existing `tasks` table (origin = 'template') rather than a new catalog table.
-- A "loose" library item is a template row with parent_task_id = NULL,
-- root_id = NULL, and an explicitly-assigned phase/milestone/task type.
--
-- 1. set_task_type(): preserve the explicit type on loose template items
--    (the depth-derivation would otherwise force 'project' for a NULL parent).
-- 2. admin_library_items(): paginated, filterable read over every template row.
-- 3. admin_library_templates(): project-template roots for the filter dropdown.
--
-- Additive + idempotent.

-- 1. set_task_type ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_task_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Loose master-library items: a template row with no parent carries an
    -- explicitly-assigned phase/milestone/task type that must survive the
    -- depth-derivation below (which forces 'project' for a NULL parent).
    IF NEW.parent_task_id IS NULL
       AND NEW.origin = 'template'
       AND NEW.task_type IN ('phase', 'milestone', 'task') THEN
        RETURN NEW;
    END IF;

    NEW.task_type := public.derive_task_type(NEW.parent_task_id);
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_task_type() OWNER TO postgres;

-- 2. admin_library_items ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_library_items(
    filter jsonb DEFAULT '{}'::jsonb,
    p_limit int DEFAULT 100,
    p_offset int DEFAULT 0
)
RETURNS TABLE (
    id uuid,
    title text,
    description text,
    task_type text,
    root_id uuid,
    template_title text,
    days_from_start int,
    is_loose boolean,
    template_version int,
    updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_task_type text := NULLIF(filter ->> 'taskType', '');
    v_template_id text := NULLIF(filter ->> 'templateId', '');
    v_search text := NULLIF(trim(COALESCE(filter ->> 'search', '')), '');
    v_search_pattern text;
    v_clamped_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));
    v_clamped_offset int := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'unauthorized: admin role required';
    END IF;

    IF v_search IS NOT NULL THEN
        v_search_pattern := '%' ||
            replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    END IF;

    -- A "loose" item has no parent (set_root_id_from_parent stamps root_id = id
    -- for parent-less rows, so NULL-checking root_id is wrong — use parent_task_id).
    -- Project roots are excluded: the library surfaces phase/milestone/task items;
    -- whole project templates are managed under /admin/templates.
    RETURN QUERY
    SELECT
        t.id,
        t.title,
        t.description,
        t.task_type,
        t.root_id,
        root.title AS template_title,
        t.days_from_start,
        (t.parent_task_id IS NULL) AS is_loose,
        t.template_version,
        t.updated_at
    FROM public.tasks t
    LEFT JOIN public.tasks root ON root.id = t.root_id AND t.parent_task_id IS NOT NULL
    WHERE t.origin = 'template'
      AND COALESCE(t.task_type, 'project') <> 'project'
      AND (v_task_type IS NULL OR v_task_type = 'all' OR t.task_type = v_task_type)
      AND (
            v_template_id IS NULL OR v_template_id = 'all'
            OR (v_template_id = '__none__' AND t.parent_task_id IS NULL)
            OR (t.parent_task_id IS NOT NULL AND t.root_id::text = v_template_id)
          )
      AND (v_search_pattern IS NULL OR t.title ILIKE v_search_pattern ESCAPE '\')
    ORDER BY t.updated_at DESC NULLS LAST, t.title ASC
    LIMIT v_clamped_limit OFFSET v_clamped_offset;
END;
$$;

ALTER FUNCTION public.admin_library_items(jsonb, int, int) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_library_items(jsonb, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_library_items(jsonb, int, int) TO authenticated;

-- 3. admin_library_templates ------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_library_templates()
RETURNS TABLE (
    id uuid,
    title text
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
    SELECT t.id, t.title
    FROM public.tasks t
    WHERE t.origin = 'template'
      AND t.parent_task_id IS NULL
      AND COALESCE(t.task_type, 'project') = 'project'
    ORDER BY t.title ASC;
END;
$$;

ALTER FUNCTION public.admin_library_templates() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_library_templates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_library_templates() TO authenticated;
