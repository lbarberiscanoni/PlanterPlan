-- Phase 2: give task resources a display alias + catalog provenance.
--
-- A task resource can now carry a friendly `name` (so the UI shows "Budget
-- Template" instead of a URL hash) and an optional `resource_id` linking it back
-- to the global catalog (public.resources) when it was attached from there.
-- Both nullable → existing rows untouched, the type CHECK constraint unaffected.

ALTER TABLE public.task_resources
    ADD COLUMN IF NOT EXISTS resource_id uuid REFERENCES public.resources(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS name text;

CREATE INDEX IF NOT EXISTS idx_task_resources_resource_id ON public.task_resources (resource_id);

-- Surface the alias on the primary-resource read view (was a NULL placeholder).
CREATE OR REPLACE VIEW public.tasks_with_primary_resource
    WITH (security_invoker = true) AS
 SELECT t.id,
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
    r.name AS resource_name,
    t.duration
   FROM tasks t
     LEFT JOIN task_resources r ON r.id = t.primary_resource_id;
