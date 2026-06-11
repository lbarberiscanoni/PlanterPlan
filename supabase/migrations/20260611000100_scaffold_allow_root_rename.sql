-- Allow renaming / re-describing a cloned project at the ROOT.
--
-- enforce_template_scaffold_immutability (20260506001000, last re-created in
-- 20260518001050) locks `title` and `description` on every `instance` row with
-- a non-null `cloned_from_task_id`. clone_project_template stamps that column on
-- every cloned row INCLUDING the project root, so once a project is created from
-- a template (the only path the wizard offers) the EditProjectModal title /
-- description edits fail with 400 / P0001 "protected template scaffold fields
-- cannot be changed". The project name is user-owned (the planter sets it via
-- the p_title override at clone time), so locking it post-creation is a bug.
--
-- The content lock exists so a future template upgrade can match in-project
-- scaffold rows back to their source by content. That rationale does not apply
-- to the root: there is no upgrade-by-title logic in the codebase, and the
-- root's provenance is tracked by cloned_from_task_id + settings.
-- spawnedFromTemplate / cloned_from_template_version (all of which stay locked
-- below), not by its title.
--
-- Fix (surgical):
--   * UPDATE: title / description are only locked on in-project scaffold rows
--     (parent_task_id IS NOT NULL). The root may be renamed / re-described.
--     Provenance + structural fields and the protected settings keys stay
--     locked on EVERY scaffold row, root included.
--   * DELETE: restore the project-root carve-out from 20260518000200 (dropped
--     when 20260518001050 re-created the function) so the two branches treat
--     roots consistently as user-owned. (App deletes go through a SECURITY
--     DEFINER RPC that already bypasses this trigger; this keeps direct
--     app-role deletes coherent.)
--
-- Master templates (origin='template') are untouched by this trigger.

CREATE OR REPLACE FUNCTION public.enforce_template_scaffold_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
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
            OR OLD.prerequisite_phase_id IS DISTINCT FROM NEW.prerequisite_phase_id
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
$$;

COMMENT ON FUNCTION public.enforce_template_scaffold_immutability() IS
    'Blocks app-role content/provenance mutation and deletion of cloned instance scaffold rows. The project ROOT (parent_task_id IS NULL) is exempt from the title/description lock (user-owned project name) and from the delete guard; provenance + structural fields and protected settings keys stay locked everywhere. parent_task_id and position are NOT immutable so planters/team can drag-and-drop. Explicit postgres/service_role bypass is reserved for audited maintenance.';
