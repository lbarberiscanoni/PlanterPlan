-- PR 4: task hierarchy depth guard.
--
-- PlanterPlan's supported task tree is:
-- project -> phase -> milestone -> task -> subtask.
-- Subtasks are the final level and cannot have children.

CREATE OR REPLACE FUNCTION public.derive_task_type(p_parent_task_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_parent_depth integer;
BEGIN
    IF p_parent_task_id IS NULL THEN
        RETURN 'project';
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT
            t.id,
            t.parent_task_id,
            0 AS depth,
            ARRAY[t.id] AS path
        FROM public.tasks t
        WHERE t.id = p_parent_task_id

        UNION ALL

        SELECT
            parent.id,
            parent.parent_task_id,
            ancestors.depth + 1,
            ancestors.path || parent.id
        FROM ancestors
        JOIN public.tasks parent ON parent.id = ancestors.parent_task_id
        WHERE NOT parent.id = ANY(ancestors.path)
          AND ancestors.depth < 32
    )
    SELECT max(depth)
      INTO v_parent_depth
      FROM ancestors;

    -- Missing parents are rejected by the FK on writes. For direct diagnostic
    -- calls, keep the legacy conservative leaf classification.
    IF v_parent_depth IS NULL THEN
        RETURN 'task';
    END IF;

    IF v_parent_depth = 0 THEN
        RETURN 'phase';
    ELSIF v_parent_depth = 1 THEN
        RETURN 'milestone';
    ELSIF v_parent_depth = 2 THEN
        RETURN 'task';
    END IF;

    RETURN 'subtask';
END;
$$;

ALTER FUNCTION public.derive_task_type(uuid) OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.enforce_task_hierarchy_depth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_parent_depth integer := -1;
    v_descendant_height integer := 0;
    v_new_depth integer;
    v_target_is_descendant boolean := false;
BEGIN
    IF NEW.parent_task_id IS NOT NULL AND NEW.parent_task_id = NEW.id THEN
        RAISE EXCEPTION 'task hierarchy cannot parent a task to itself'
            USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        WITH RECURSIVE descendants AS (
            SELECT
                child.id,
                1 AS depth,
                ARRAY[NEW.id, child.id] AS path
            FROM public.tasks child
            WHERE child.parent_task_id = NEW.id
              AND child.id <> NEW.id

            UNION ALL

            SELECT
                child.id,
                descendants.depth + 1,
                descendants.path || child.id
            FROM descendants
            JOIN public.tasks child ON child.parent_task_id = descendants.id
            WHERE NOT child.id = ANY(descendants.path)
              AND descendants.depth < 32
        )
        SELECT
            COALESCE(max(depth), 0),
            COALESCE(bool_or(id = NEW.parent_task_id), false)
          INTO v_descendant_height, v_target_is_descendant
          FROM descendants;

        IF v_target_is_descendant THEN
            RAISE EXCEPTION 'task hierarchy cannot parent a task under its own descendant'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF NEW.parent_task_id IS NOT NULL THEN
        WITH RECURSIVE ancestors AS (
            SELECT
                parent.id,
                parent.parent_task_id,
                0 AS depth,
                ARRAY[parent.id] AS path
            FROM public.tasks parent
            WHERE parent.id = NEW.parent_task_id

            UNION ALL

            SELECT
                parent.id,
                parent.parent_task_id,
                ancestors.depth + 1,
                ancestors.path || parent.id
            FROM ancestors
            JOIN public.tasks parent ON parent.id = ancestors.parent_task_id
            WHERE NOT parent.id = ANY(ancestors.path)
              AND ancestors.depth < 32
        )
        SELECT max(depth)
          INTO v_parent_depth
          FROM ancestors;

        -- The parent FK reports the missing-parent violation; do not mask it.
        IF v_parent_depth IS NULL THEN
            RETURN NEW;
        END IF;
    END IF;

    v_new_depth := v_parent_depth + 1;

    IF v_new_depth + v_descendant_height > 4 THEN
        RAISE EXCEPTION 'task hierarchy depth exceeded: subtasks cannot have child tasks'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_task_hierarchy_depth() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_task_hierarchy_depth() IS
    'Prevents task parent changes that would exceed project -> phase -> milestone -> task -> subtask depth or create cycles.';

DROP TRIGGER IF EXISTS "trg_enforce_task_hierarchy_depth" ON public.tasks;
CREATE TRIGGER "trg_enforce_task_hierarchy_depth"
BEFORE INSERT OR UPDATE OF parent_task_id ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_task_hierarchy_depth();
