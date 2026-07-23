-- Backfill the admin-curated resources that were imported (via spreadsheet) onto
-- TEMPLATE tasks into the global `public.resources` catalog, so they appear on
-- the /resources library page. Before this, the Resources page read only the
-- `resources` catalog while those imported links lived exclusively in
-- `task_resources` — so they never showed up.
--
-- Scope: only template-origin URL attachments are promoted. Instance/project
-- custom attachments stay custom (product rule: "admin/template resources → the
-- library; user-added resources stay custom"). Text/PDF template attachments are
-- skipped — the catalog is a URL library (name + url, both NOT NULL).
--
-- Idempotent: dedups by URL against the existing catalog, and the link step only
-- fills NULL resource_ids, so re-running is a no-op.

-- 1) Promote distinct template URL resources not already in the catalog.
INSERT INTO public.resources (name, url, status)
SELECT DISTINCT ON (tr.resource_url)
       NULLIF(TRIM(tr.name), '') AS name,
       tr.resource_url           AS url,
       'approved'                AS status
FROM public.task_resources tr
JOIN public.tasks t ON t.id = tr.task_id
WHERE t.origin = 'template'
  AND tr.resource_type = 'url'
  AND tr.resource_url IS NOT NULL
  AND TRIM(tr.resource_url) <> ''
  AND NULLIF(TRIM(tr.name), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.resources r WHERE r.url = tr.resource_url
  )
ORDER BY tr.resource_url, TRIM(tr.name);

-- 2) Link each template URL attachment back to its catalog row (provenance), so
--    clones inherit the catalog link (clone_project_template carries resource_id).
UPDATE public.task_resources tr
SET resource_id = sub.rid
FROM (SELECT url, MIN(id) AS rid FROM public.resources GROUP BY url) sub,
     public.tasks t
WHERE tr.task_id = t.id
  AND t.origin = 'template'
  AND tr.resource_type = 'url'
  AND tr.resource_url = sub.url
  AND tr.resource_id IS NULL;
