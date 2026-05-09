-- PR 3: template scaffold metadata hardening.
--
-- Earlier Wave 36 comments described a project-owner exception. The current
-- release contract is stricter: cloned instance scaffold rows are protected
-- below UI for every authenticated app role. Keep DB metadata aligned with
-- the enforced trigger behavior.

COMMENT ON COLUMN public.tasks.cloned_from_task_id IS
    'Stamped during clone_project_template for every cloned descendant. Points to the source template task. NULL on pre-Wave-36 rows and on post-instantiation additions. Cloned instance scaffold rows are protected below UI from app-role deletes and structural/content/provenance edits; postgres/service_role bypass is reserved for audited maintenance.';
