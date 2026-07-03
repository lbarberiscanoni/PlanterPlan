-- =============================================================================
-- DESTRUCTIVE prod reset — Step 1 (wipe data) + Step 2 (delete users).
-- Run BEFORE standard-template.seed.sql. Runs as postgres/service_role so the
-- scaffold-immutability trigger is bypassed and cloned instance rows can be deleted.
-- Atomic: the whole thing commits or nothing does.
-- =============================================================================
BEGIN;

-- Guard: refuse if any deletion target is an admin (defense against a bad list).
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(u.email, ', ') INTO bad
  FROM auth.users u
  JOIN public.admin_users a ON a.user_id = u.id
  WHERE u.email = ANY (ARRAY[
    'joela510@gmail.com','joel.abraham@omron.com','tim.planterplan@gmail.com',
    'tjcheung@uci.edu','patrick@churchplantingtactics.com','patrick@pbradleycoach.com',
    'fredlenam27@gmail.com','andreww@nexus.us','msawyers@fullstrength.org',
    'clefko@newlifebfc.org','ryan@trinitybenicia.com','nickz@church-planting.net',
    'rohityarlagadda42@gmail.com','jread108@gmail.com','hllbck7@gmail.com'
  ]);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'refusing to run: these deletion targets are admins: %', bad;
  END IF;
END $$;

-- Step 1 — wipe ALL tasks (every root, both origins) EXCEPT the freshly-imported
-- Standard Church Plant root, so the import can run first and prod is never
-- template-less. The GUC suppresses the activity_log audit-insert that would
-- otherwise hit FK 23503 during the cascade.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.tasks
    WHERE parent_task_id IS NULL
      AND id <> '2dfd71b3-a18e-5f11-b5c4-a5216dc95cc1'  -- keep the new template root
  LOOP
    PERFORM set_config('planter.deleting_project_root', r.id::text, true);
    DELETE FROM public.tasks WHERE id = r.id;  -- cascades subtree + members/resources/comments/relationships/activity_log
  END LOOP;
END $$;

-- Residual audit noise from old admin-only actions (project_id IS NULL rows that
-- did not cascade with any project).
DELETE FROM public.activity_log WHERE project_id IS NULL;

-- Step 2 — delete the 15 real-person, non-admin, non-test users.
-- FKs to auth.users are all CASCADE / SET NULL, so this is clean.
DELETE FROM auth.users WHERE email = ANY (ARRAY[
  'joela510@gmail.com','joel.abraham@omron.com','tim.planterplan@gmail.com',
  'tjcheung@uci.edu','patrick@churchplantingtactics.com','patrick@pbradleycoach.com',
  'fredlenam27@gmail.com','andreww@nexus.us','msawyers@fullstrength.org',
  'clefko@newlifebfc.org','ryan@trinitybenicia.com','nickz@church-planting.net',
  'rohityarlagadda42@gmail.com','jread108@gmail.com','hllbck7@gmail.com'
]);

COMMIT;
