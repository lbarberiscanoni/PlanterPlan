-- Align the error message in enforce_task_hierarchy_depth with the
-- contract baked into the schema-source unit test (Testing/unit/shared/db/
-- schema-source.test.ts): "subtasks cannot have child tasks" is the
-- canonical phrasing for the UX-facing rejection toast.
--
-- This is a cosmetic fix on top of 20260520010000 — the cap value (> 4)
-- and behavior are unchanged.

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
