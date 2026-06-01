-- Allow planters and team members to rearrange scaffold tasks within their own
-- project (drag-and-drop reorder + reparent). Previously the scaffold
-- immutability trigger blocked any change to parent_task_id or position on
-- cloned-from-template rows, which made DnD silently fail for every task that
-- came in from a template — i.e. the whole tree of a freshly-cloned project.
--
-- Content/provenance fields (title, description, actions, settings keys,
-- cloned_from_task_id, template_version, etc.) remain locked so template
-- upgrades can still match scaffold rows back to their source.
--
-- Master templates (origin='template') are untouched by this trigger; their
-- editability is governed by RLS + admin-only mutation paths.

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
        IF OLD.origin = 'instance' AND OLD.cloned_from_task_id IS NOT NULL THEN
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
        -- parent_task_id and position are deliberately omitted from this list
        -- so users can drag-and-drop scaffold rows around their own project.
        -- Content + provenance fields stay locked.
        IF
            OLD.id IS DISTINCT FROM NEW.id
            OR OLD.title IS DISTINCT FROM NEW.title
            OR OLD.description IS DISTINCT FROM NEW.description
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
    'Blocks app-role content/provenance mutation and deletion of cloned instance scaffold rows. parent_task_id and position are intentionally NOT immutable so planters and team members can rearrange scaffold rows within their own project via drag-and-drop. Explicit postgres/service_role bypass is reserved for audited maintenance.';
