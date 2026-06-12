-- Fully remove the dormant phase-locking feature (Step 3 / sub-step 2, "go further").
--
-- Follows 20260612020000 (dropped the inert unlock triggers + functions). This
-- wave removes the two columns the feature stored state in:
--   * tasks.is_locked            -- always false in prod (0/4843 rows ever locked)
--   * tasks.prerequisite_phase_id-- always NULL in prod (0/4843 rows)
-- The frontend no longer reads either column (TaskItem / PhaseCard /
-- MilestoneSection were refactored to drop the locked-state UI in this branch).
--
-- Dependencies handled in order:
--   1. The view public.tasks_with_primary_resource SELECTs both columns -> must be
--      dropped first (CREATE OR REPLACE VIEW cannot remove columns), then recreated.
--   2. The trigger fn enforce_template_scaffold_immutability guards
--      prerequisite_phase_id in its protected-field comparison list -> replace it
--      first so the post-drop function no longer references the column.
--   3. The FK tasks_prerequisite_phase_id_fkey is dropped automatically with the
--      column (kept explicit here for clarity).

-- 1. Drop the dependent view.
DROP VIEW IF EXISTS public.tasks_with_primary_resource;

-- 2. Replace the scaffold-immutability guard, removing the prerequisite_phase_id
--    comparison (the rest of the body is unchanged).
CREATE OR REPLACE FUNCTION public.enforce_template_scaffold_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    v_key text;
    v_protected_setting_keys text[] := ARRAY[
        'is_coaching_task',
        'is_strategy_template',
        'spawnedFromTemplate',
        'spawnedOn',
        'cloned_from_template_version',
        'recurrence',
        'published',
        'seed_key'
    ];
BEGIN
    IF current_user IN ('postgres', 'supabase_admin', 'service_role')
        OR auth.role() = 'service_role'
    THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- Project roots (parent_task_id IS NULL) are deletable so the
        -- EditProjectModal "Delete Project" flow can cascade-remove a cloned
        -- project. Only in-project scaffold rows are guarded.
        IF OLD.origin = 'instance'
            AND OLD.cloned_from_task_id IS NOT NULL
            AND OLD.parent_task_id IS NOT NULL
        THEN
            RAISE EXCEPTION 'protected template scaffold tasks cannot be deleted'
                USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    END IF;

    IF NOT (OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL)
        AND NEW.origin = 'instance'
        AND NEW.cloned_from_task_id IS NOT NULL
    THEN
        RAISE EXCEPTION 'template scaffold provenance is managed by clone_project_template'
            USING ERRCODE = 'P0001';
    END IF;

    IF OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL THEN
        -- Title / description are user-owned on the project ROOT (the project
        -- name + blurb the planter edits) but stay locked on in-project
        -- scaffold rows so a future template upgrade can still match them.
        IF OLD.parent_task_id IS NOT NULL AND (
            OLD.title IS DISTINCT FROM NEW.title
            OR OLD.description IS DISTINCT FROM NEW.description
        ) THEN
            RAISE EXCEPTION 'protected template scaffold fields cannot be changed'
                USING ERRCODE = 'P0001';
        END IF;

        -- parent_task_id and position are deliberately omitted so users can
        -- drag-and-drop scaffold rows. Provenance + structural fields stay
        -- locked on every scaffold row, root included.
        IF
            OLD.id IS DISTINCT FROM NEW.id
            OR OLD.origin IS DISTINCT FROM NEW.origin
            OR OLD.creator IS DISTINCT FROM NEW.creator
            OR OLD.root_id IS DISTINCT FROM NEW.root_id
            OR OLD.purpose IS DISTINCT FROM NEW.purpose
            OR OLD.actions IS DISTINCT FROM NEW.actions
            OR OLD.created_at IS DISTINCT FROM NEW.created_at
            OR OLD.parent_project_id IS DISTINCT FROM NEW.parent_project_id
            OR OLD.project_type IS DISTINCT FROM NEW.project_type
            OR OLD.is_premium IS DISTINCT FROM NEW.is_premium
            OR OLD.location IS DISTINCT FROM NEW.location
            OR OLD.task_type IS DISTINCT FROM NEW.task_type
            OR OLD.template_version IS DISTINCT FROM NEW.template_version
            OR OLD.cloned_from_task_id IS DISTINCT FROM NEW.cloned_from_task_id
        THEN
            RAISE EXCEPTION 'protected template scaffold fields cannot be changed'
                USING ERRCODE = 'P0001';
        END IF;

        FOREACH v_key IN ARRAY v_protected_setting_keys LOOP
            IF (COALESCE(OLD.settings, '{}'::jsonb) -> v_key)
                IS DISTINCT FROM
               (COALESCE(NEW.settings, '{}'::jsonb) -> v_key)
            THEN
                RAISE EXCEPTION 'protected template scaffold settings cannot be changed: %', v_key
                    USING ERRCODE = 'P0001';
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$function$;

-- 3. Drop the FK + the two columns (FK drop is redundant with the column drop,
--    kept explicit for clarity).
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_prerequisite_phase_id_fkey;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS prerequisite_phase_id;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS is_locked;

-- 4. Recreate the view without the two columns, preserving security_invoker + grants.
CREATE VIEW public.tasks_with_primary_resource
WITH (security_invoker = true) AS
SELECT
    t.id,
    t.parent_task_id,
    t.title,
    t.description,
    t.status,
    t.origin,
    t.creator,
    t.root_id,
    t.notes,
    t.days_from_start,
    t.start_date,
    t.due_date,
    t."position",
    t.created_at,
    t.updated_at,
    t.purpose,
    t.actions,
    t.is_complete,
    t.primary_resource_id,
    t.parent_project_id,
    t.project_type,
    t.assignee_id,
    t.is_premium,
    t.location,
    t.priority,
    t.settings,
    t.supervisor_email,
    t.task_type,
    t.template_version,
    t.cloned_from_task_id,
    r.id AS resource_id,
    r.resource_type::text AS resource_type,
    r.resource_url,
    r.resource_text,
    r.storage_path,
    NULL::text AS resource_name
FROM public.tasks t
LEFT JOIN public.task_resources r ON r.id = t.primary_resource_id;

GRANT SELECT ON public.tasks_with_primary_resource TO authenticated, service_role;
