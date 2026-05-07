-- PR 3: coach RBAC field-level enforcement.
--
-- The existing coach UPDATE policy scoped rows to Coaching-labeled instance
-- tasks, but it did not scope columns. This trigger keeps coach mutations to
-- task progress only, while owner/editor/admin and service-role maintenance
-- paths remain explicit.

CREATE OR REPLACE FUNCTION public.enforce_coach_task_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_project_id uuid;
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR auth.role() = 'service_role'
    THEN
        RETURN NEW;
    END IF;

    IF v_actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_project_id := COALESCE(OLD.root_id, OLD.id);
    IF v_project_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF public.is_admin(v_actor_id)
        OR public.has_project_role(v_project_id, v_actor_id, ARRAY['owner', 'editor'])
    THEN
        RETURN NEW;
    END IF;

    IF NOT public.has_project_role(v_project_id, v_actor_id, ARRAY['coach']) THEN
        RETURN NEW;
    END IF;

    IF NOT (
        OLD.origin = 'instance'
        AND COALESCE(
            (COALESCE(OLD.settings, '{}'::jsonb) -> 'is_coaching_task') = 'true'::jsonb,
            false
        )
    ) THEN
        RAISE EXCEPTION 'coach role may update only Coaching-labeled instance tasks'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.origin IS DISTINCT FROM 'instance'
        OR NOT COALESCE(
            (COALESCE(NEW.settings, '{}'::jsonb) -> 'is_coaching_task') = 'true'::jsonb,
            false
        )
    THEN
        RAISE EXCEPTION 'coach role cannot remove Coaching scope from a task'
            USING ERRCODE = 'P0001';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
        AND COALESCE(NEW.status, '') NOT IN ('todo', 'not_started', 'in_progress', 'blocked', 'completed', 'overdue')
    THEN
        RAISE EXCEPTION 'coach role cannot set unsupported task status: %', NEW.status
            USING ERRCODE = 'P0001';
    END IF;

    IF
        OLD.id IS DISTINCT FROM NEW.id
        OR OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id
        OR OLD.title IS DISTINCT FROM NEW.title
        OR OLD.description IS DISTINCT FROM NEW.description
        OR OLD.origin IS DISTINCT FROM NEW.origin
        OR OLD.creator IS DISTINCT FROM NEW.creator
        OR OLD.root_id IS DISTINCT FROM NEW.root_id
        OR OLD.notes IS DISTINCT FROM NEW.notes
        OR OLD.days_from_start IS DISTINCT FROM NEW.days_from_start
        OR OLD.start_date IS DISTINCT FROM NEW.start_date
        OR OLD.due_date IS DISTINCT FROM NEW.due_date
        OR OLD.position IS DISTINCT FROM NEW.position
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.purpose IS DISTINCT FROM NEW.purpose
        OR OLD.actions IS DISTINCT FROM NEW.actions
        OR OLD.primary_resource_id IS DISTINCT FROM NEW.primary_resource_id
        OR OLD.is_locked IS DISTINCT FROM NEW.is_locked
        OR OLD.prerequisite_phase_id IS DISTINCT FROM NEW.prerequisite_phase_id
        OR OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id
        OR OLD.project_type IS DISTINCT FROM NEW.project_type
        OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
        OR OLD.is_premium IS DISTINCT FROM NEW.is_premium
        OR OLD.location IS DISTINCT FROM NEW.location
        OR OLD.priority IS DISTINCT FROM NEW.priority
        OR OLD.settings IS DISTINCT FROM NEW.settings
        OR OLD.supervisor_email IS DISTINCT FROM NEW.supervisor_email
        OR OLD.task_type IS DISTINCT FROM NEW.task_type
        OR OLD.template_version IS DISTINCT FROM NEW.template_version
        OR OLD.cloned_from_task_id IS DISTINCT FROM NEW.cloned_from_task_id
    THEN
        RAISE EXCEPTION 'coach role may update only task progress fields'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_coach_task_update_scope() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_coach_task_update_scope() IS
    'Restricts project coaches to status/progress updates on Coaching-labeled instance tasks. Owner/editor/admin and service-role maintenance paths bypass explicitly.';

DROP TRIGGER IF EXISTS "trg_enforce_coach_task_update_scope" ON public.tasks;
CREATE TRIGGER "trg_enforce_coach_task_update_scope"
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_coach_task_update_scope();

DROP POLICY IF EXISTS "Enable update for coaches on coaching tasks" ON public.tasks;
CREATE POLICY "Enable update for coaches on coaching tasks" ON public.tasks
FOR UPDATE TO authenticated
USING (
    public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['coach'::text])
    AND (COALESCE(settings, '{}'::jsonb) -> 'is_coaching_task') = 'true'::jsonb
    AND origin = 'instance'::text
)
WITH CHECK (
    public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['coach'::text])
    AND (COALESCE(settings, '{}'::jsonb) -> 'is_coaching_task') = 'true'::jsonb
    AND origin = 'instance'::text
);

COMMENT ON POLICY "Enable update for coaches on coaching tasks" ON public.tasks IS
    'Row-level gate for coach progress updates. Column-level scope is enforced by trg_enforce_coach_task_update_scope.';
