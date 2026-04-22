-- Post-megabatch: repair the tasks_with_primary_resource view
--
-- The current view body (docs/db/schema.sql:1882-1918) returns
-- hardcoded `NULL::uuid` / `NULL::text` for every resource column instead
-- of LEFT JOINing `task_resources`. The view has been broken since the
-- Wave 21 supervisor-email migration comment claimed the join existed.
-- Any consumer (planterClient entity reads, admin analytics, search)
-- that expected `resource_*` columns to be populated has been silently
-- reading NULL.
--
-- Replace with the intended LEFT JOIN against `task_resources` scoped to
-- the task's `primary_resource_id`. `template_version` and
-- `cloned_from_task_id` (Wave 36) are also projected so the view stays
-- column-parity with the underlying `public.tasks` table.

CREATE OR REPLACE VIEW public.tasks_with_primary_resource AS
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
    t.position,
    t.created_at,
    t.updated_at,
    t.purpose,
    t.actions,
    t.is_complete,
    t.primary_resource_id,
    t.is_locked,
    t.prerequisite_phase_id,
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
    -- resource_name is not a column on public.task_resources; keep as NULL
    -- to preserve the projection shape that consumers (database.types.ts)
    -- already declare.
    NULL::text AS resource_name
FROM public.tasks t
LEFT JOIN public.task_resources r ON r.id = t.primary_resource_id;

-- SEC-8 pair: security_invoker respects RLS on tasks + task_resources.
ALTER VIEW public.tasks_with_primary_resource SET (security_invoker = true);

-- Leave SELECT grant as-is for authenticated (RLS does the per-row gating
-- now that security_invoker is on). Revoke from anon explicitly.
REVOKE SELECT ON public.tasks_with_primary_resource FROM anon;
