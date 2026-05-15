-- Unify the "Phase Lead" assignment model across phase / milestone / task / subtask.
--
-- Before: `user_is_phase_lead(target_task_id, uid)` returned true only when an
-- ancestor of the target had `settings.phase_lead_user_ids` containing `uid`.
-- That meant assigning a user directly to a task or subtask granted them no
-- elevated UPDATE access on that row — only assignment on an ancestor counted.
--
-- After: we also check the target task itself. A user listed in
-- `phase_lead_user_ids` on row R is considered a phase lead on R AND on every
-- descendant of R. The existing "Enable update for phase leads" RLS policy and
-- the `enforce_phase_lead_task_update_scope` BEFORE UPDATE trigger continue to
-- restrict *what* fields a Phase Lead may modify (content/schedule/progress),
-- so the widening cannot be used to escalate privileges via self-edit of
-- `settings.phase_lead_user_ids`.

CREATE OR REPLACE FUNCTION public.user_is_phase_lead(target_task_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  WITH RECURSIVE chain AS (
    SELECT id, parent_task_id
    FROM public.tasks
    WHERE id = target_task_id
    UNION ALL
    SELECT t.id, t.parent_task_id
    FROM public.tasks t
    JOIN chain c ON t.id = c.parent_task_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM chain c
    JOIN public.tasks t ON t.id = c.id
    WHERE t.settings ? 'phase_lead_user_ids'
      AND (t.settings -> 'phase_lead_user_ids') ? uid::text
  );
$$;

ALTER FUNCTION public.user_is_phase_lead(uuid, uuid) OWNER TO postgres;

COMMENT ON FUNCTION public.user_is_phase_lead(uuid, uuid) IS
  'Returns true when `uid` is listed in `settings.phase_lead_user_ids` on the target task OR any of its ancestors up to the project root. Used by the "Enable update for phase leads" RLS policy and `enforce_phase_lead_task_update_scope` trigger to gate viewer/limited assignment access.';
