-- Expose the new tasks.duration column through the read views so the app can
-- read a task's duration (the envelope engine's leaf length). Both views are
-- explicit column lists (not SELECT *), so they don't pick it up automatically.
-- Column order is preserved and `t.duration` appended at the end, as required
-- by CREATE OR REPLACE VIEW. security_invoker is re-specified to preserve it.

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
    NULL::text AS resource_name,
    t.duration
   FROM tasks t
     LEFT JOIN task_resources r ON r.id = t.primary_resource_id;

CREATE OR REPLACE VIEW public.view_master_library
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
    t.primary_resource_id AS resource_id,
    t.duration
   FROM tasks t
  WHERE t.origin = 'template'::text;
