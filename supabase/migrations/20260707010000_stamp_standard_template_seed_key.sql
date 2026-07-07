-- Stamp seed_key='launch_large' on the "Standard Church Plant" template root.
--
-- The first-run empty-state CTA (/tasks?action=new-project&template=launch_large) and the
-- onboarding wizard resolve a template by matching settings.seed_key === the URL seed key
-- (getTemplateSeedKey in CreateProjectModal.tsx). The imported template (commit e74742bd)
-- never carried a seed_key, so the lookup returned null and both surfaces silently fell back
-- to the blank 6-phase scaffold (DEFAULT_SCAFFOLD_ID) instead of cloning the real template.
--
-- 'launch_large' is the key those CTAs already pass, and the one the local bootstrap check
-- (scripts/supabase-local-bootstrap.cjs) expects on a published template. Stamping it makes
-- the CTAs clone the Standard Church Plant template. Clone does NOT propagate seed_key into
-- instance settings, so cloned projects are unaffected.
--
-- Idempotent: jsonb concat overwrites/sets the single key; re-running is a no-op.

UPDATE public.tasks
SET settings = COALESCE(settings, '{}'::jsonb) || '{"seed_key": "launch_large"}'::jsonb
WHERE id = '2dfd71b3-a18e-5f11-b5c4-a5216dc95cc1'
  AND origin = 'template'
  AND parent_task_id IS NULL;
