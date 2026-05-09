-- PR 2: role-permission matrix hardening.
--
-- Current architecture treats global admins as full task administrators, but
-- the task INSERT/UPDATE/DELETE policies only covered creators and
-- owner/editor project members. It also lets viewer/limited Phase Leads update
-- existing descendant tasks, but the policy was broad enough to accept crafted
-- structural/settings/assignment payloads. Keep both rules explicit below RLS.

CREATE OR REPLACE FUNCTION public.enforce_phase_lead_task_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_actor_id uuid := auth.uid();
    v_project_id uuid := COALESCE(OLD.root_id, NEW.root_id, OLD.id, NEW.id);
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR auth.role() = 'service_role'
    THEN
        RETURN NEW;
    END IF;

    IF v_actor_id IS NULL OR v_project_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF public.is_admin(v_actor_id)
        OR public.has_project_role(v_project_id, v_actor_id, ARRAY['owner', 'editor'])
    THEN
        RETURN NEW;
    END IF;

    IF NOT (
        public.has_project_role(v_project_id, v_actor_id, ARRAY['viewer', 'limited'])
        AND public.user_is_phase_lead(OLD.id, v_actor_id)
    ) THEN
        RETURN NEW;
    END IF;

    IF NEW.origin IS DISTINCT FROM 'instance'
        OR NOT public.user_is_phase_lead(NEW.id, v_actor_id)
    THEN
        RAISE EXCEPTION 'phase lead role may update only existing descendant instance tasks'
            USING ERRCODE = 'P0001';
    END IF;

    IF
        OLD.id IS DISTINCT FROM NEW.id
        OR OLD.root_id IS DISTINCT FROM NEW.root_id
        OR OLD.parent_task_id IS DISTINCT FROM NEW.parent_task_id
        OR OLD.position IS DISTINCT FROM NEW.position
        OR OLD.origin IS DISTINCT FROM NEW.origin
        OR OLD.creator IS DISTINCT FROM NEW.creator
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        OR OLD.assignee_id IS DISTINCT FROM NEW.assignee_id
        OR OLD.settings IS DISTINCT FROM NEW.settings
        OR OLD.notes IS DISTINCT FROM NEW.notes
        OR OLD.primary_resource_id IS DISTINCT FROM NEW.primary_resource_id
        OR OLD.is_locked IS DISTINCT FROM NEW.is_locked
        OR OLD.prerequisite_phase_id IS DISTINCT FROM NEW.prerequisite_phase_id
        OR OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id
        OR OLD.project_type IS DISTINCT FROM NEW.project_type
        OR OLD.is_premium IS DISTINCT FROM NEW.is_premium
        OR OLD.location IS DISTINCT FROM NEW.location
        OR OLD.priority IS DISTINCT FROM NEW.priority
        OR OLD.supervisor_email IS DISTINCT FROM NEW.supervisor_email
        OR OLD.task_type IS DISTINCT FROM NEW.task_type
        OR OLD.template_version IS DISTINCT FROM NEW.template_version
        OR OLD.cloned_from_task_id IS DISTINCT FROM NEW.cloned_from_task_id
    THEN
        RAISE EXCEPTION 'phase lead role may update only task content, schedule, and progress fields'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_phase_lead_task_update_scope() OWNER TO postgres;

COMMENT ON FUNCTION public.enforce_phase_lead_task_update_scope() IS
    'Restricts viewer/limited Phase Leads to content, schedule, and progress updates on existing descendant instance tasks. Owner/editor/admin and service-role maintenance paths bypass explicitly.';

DROP TRIGGER IF EXISTS "trg_enforce_phase_lead_task_update_scope" ON public.tasks;
CREATE TRIGGER "trg_enforce_phase_lead_task_update_scope"
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.enforce_phase_lead_task_update_scope();

DROP POLICY IF EXISTS "Allow project creation" ON public.tasks;
CREATE POLICY "Allow project creation" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
    ((root_id IS NULL) OR (root_id = id))
    AND parent_task_id IS NULL
    AND creator = (SELECT auth.uid() AS uid)
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

DROP POLICY IF EXISTS "Allow subtask creation by members" ON public.tasks;
CREATE POLICY "Allow subtask creation by members" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
    root_id IS NOT NULL
    AND (
        public.has_project_role(root_id, (SELECT auth.uid() AS uid), ARRAY['owner', 'editor'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

DROP POLICY IF EXISTS "Enable insert for authenticated users within project" ON public.tasks;
CREATE POLICY "Enable insert for authenticated users within project" ON public.tasks
FOR INSERT
WITH CHECK (
    (
        (
            auth.role() = 'authenticated'
            AND root_id IS NULL
            AND parent_task_id IS NULL
            AND creator = (SELECT auth.uid() AS uid)
        )
        OR public.has_project_role(root_id, (SELECT auth.uid() AS uid), ARRAY['owner', 'editor'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);

DROP POLICY IF EXISTS "Enable delete for users" ON public.tasks;
CREATE POLICY "Enable delete for users" ON public.tasks
FOR DELETE
USING (
    creator = (SELECT auth.uid() AS uid)
    OR public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['owner', 'editor'])
    OR public.is_admin((SELECT auth.uid() AS uid))
);

DROP POLICY IF EXISTS "Enable update for phase leads" ON public.tasks;
CREATE POLICY "Enable update for phase leads" ON public.tasks
FOR UPDATE TO authenticated
USING (
    origin = 'instance'
    AND public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['viewer', 'limited'])
    AND public.user_is_phase_lead(id, (SELECT auth.uid() AS uid))
)
WITH CHECK (
    origin = 'instance'
    AND public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['viewer', 'limited'])
    AND public.user_is_phase_lead(id, (SELECT auth.uid() AS uid))
);

DROP POLICY IF EXISTS "Enable update for users" ON public.tasks;
CREATE POLICY "Enable update for users" ON public.tasks
FOR UPDATE
USING (
    (
        creator = (SELECT auth.uid() AS uid)
        OR public.has_project_role(COALESCE(root_id, id), (SELECT auth.uid() AS uid), ARRAY['owner', 'editor'])
        OR public.is_admin((SELECT auth.uid() AS uid))
    )
    AND (origin IS DISTINCT FROM 'template' OR public.is_admin((SELECT auth.uid() AS uid)))
);
