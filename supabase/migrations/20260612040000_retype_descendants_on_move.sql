-- DRAFT (for review — not yet applied). Fix the task_type drift root cause.
--
-- task_type is BY DESIGN a pure function of tree depth, computed by
-- public.derive_task_type(parent_task_id): root -> 'project', depth-1 -> 'phase',
-- depth-2 -> 'milestone', depth-3 -> 'task', depth-4+ -> 'subtask'. The existing
-- BEFORE INSERT OR UPDATE OF parent_task_id trigger trg_set_task_type stamps this
-- correctly for the row being written.
--
-- THE BUG: when a SUBTREE is re-parented (drag-and-drop / reorder changes one
-- node's parent_task_id), every DESCENDANT's depth shifts too — but trg_set_task_type
-- only re-derives the moved node itself, never its descendants. Their task_type
-- freezes at the pre-move value and drifts from depth over repeated edits.
--
-- Evidence (live prod, 2026-06-12, verified via SQL): a lightly-edited project has
-- 12/64 rows with task_type != depth-derived (all on the benign d3->d4 task/subtask
-- boundary), while a heavily-edited project has 231/434 mismatched in EVERY direction
-- (phase<->task, milestone<->task, milestone<->subtask, incl. depth-2 rows titled
-- "Milestone: ..." stored as 'task'). 8 of 57 instance projects are affected. This
-- drift is the root cause of the "too much in one milestone" grouping symptom on
-- /tasks, because both the grouped view and the new task-numbering trust task_type
-- to identify milestone/phase containers.
--
-- FIX: add an AFTER UPDATE OF parent_task_id trigger that re-derives task_type for
-- the entire moved subtree's descendants (the moved node itself is still handled by
-- the BEFORE trigger). Uses the same derive_task_type() the BEFORE trigger uses, so
-- semantics stay identical — it just extends coverage to descendants.
--
-- Note: this re-types descendants only when parent_task_id actually changes, and only
-- writes rows whose type actually differs (IS DISTINCT FROM), so it's a no-op on the
-- vast majority of moves and never fires itself recursively (it updates task_type,
-- not parent_task_id, so trg_set_task_type does not re-fire).

CREATE OR REPLACE FUNCTION public.retype_descendants_after_move()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
BEGIN
  -- Walk DOWN from the moved node to collect its descendants. A depth guard
  -- (mirroring derive_task_type's <32 cap) protects against any malformed cycle;
  -- the hierarchy-depth trigger + FK make real cycles impossible.
  WITH RECURSIVE descendants AS (
    SELECT c.id, c.parent_task_id, 1 AS lvl
    FROM public.tasks c
    WHERE c.parent_task_id = NEW.id
    UNION ALL
    SELECT c.id, c.parent_task_id, d.lvl + 1
    FROM public.tasks c
    JOIN descendants d ON c.parent_task_id = d.id
    WHERE d.lvl < 32
  )
  UPDATE public.tasks t
  SET task_type = public.derive_task_type(t.parent_task_id)
  FROM descendants d
  WHERE t.id = d.id
    AND t.task_type IS DISTINCT FROM public.derive_task_type(t.parent_task_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_retype_descendants_on_move ON public.tasks;

CREATE TRIGGER trg_retype_descendants_on_move
  AFTER UPDATE OF parent_task_id ON public.tasks
  FOR EACH ROW
  WHEN (OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id)
  EXECUTE FUNCTION public.retype_descendants_after_move();
