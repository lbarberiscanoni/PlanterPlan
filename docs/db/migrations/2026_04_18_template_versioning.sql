-- Wave 36 Task 1 — Template versioning
--
-- Adds a monotonic `template_version` column on `public.tasks` (only
-- semantic on `origin = 'template'` rows) and a BEFORE UPDATE trigger that
-- increments it whenever a text/structural edit lands on a template row.
-- Also stamps the source template's version onto cloned roots via
-- `settings.cloned_from_template_version` — done in the existing
-- `clone_project_template` RPC body (Wave 23 snapshot).
--
-- Intentionally non-propagating: edits to a template do NOT update existing
-- instances' stamps. The architecture doc explicitly calls that out; this
-- migration only makes the version trackable.
--
-- Additive only.

ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS template_version int NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.bump_template_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Fire only on template-to-template updates.
    IF OLD.origin = 'template' AND NEW.origin = 'template' THEN
        IF
            COALESCE(NEW.title, '') IS DISTINCT FROM COALESCE(OLD.title, '')
            OR COALESCE(NEW.description, '') IS DISTINCT FROM COALESCE(OLD.description, '')
            OR COALESCE(NEW.days_from_start, -1) IS DISTINCT FROM COALESCE(OLD.days_from_start, -1)
            OR COALESCE(NEW.settings, '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.settings, '{}'::jsonb)
        THEN
            NEW.template_version := COALESCE(OLD.template_version, 0) + 1;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_template_version ON public.tasks;
CREATE TRIGGER trg_bump_template_version
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.bump_template_version();

-- Note: stamping `settings.cloned_from_template_version` on the cloned root
-- is done client-side in `planter.entities.Task.clone` (see src/shared/api/
-- planterClient.ts) so it can merge with the pre-existing
-- `spawnedFromTemplate` stamp in one atomic write. The RPC body itself is
-- patched separately in `2026_04_18_clone_rpc_wave36_patch.sql` to add the
-- `cloned_from_task_id` server-side stamp for every cloned descendant
-- (Wave 36 Task 2).

COMMENT ON COLUMN public.tasks.template_version IS
    'Wave 36 — monotonic version on template rows (origin = ''template''). Bumped by trg_bump_template_version on text/structural edits. Cloned instance roots stamp settings.cloned_from_template_version at clone time for traceability; edits to the source template do NOT propagate to existing instances (intentional).';
