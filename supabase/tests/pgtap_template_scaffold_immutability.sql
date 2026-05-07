BEGIN;

SELECT plan(14);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'template-immut-owner@example.com',
    'template-immut-editor@example.com',
    'template-immut-coach@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000501', 'template-immut-owner@example.com'),
    ('00000000-0000-0000-0000-000000000502', 'template-immut-editor@example.com'),
    ('00000000-0000-0000-0000-000000000503', 'template-immut-coach@example.com');

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, settings, template_version
) VALUES (
    '11111111-1111-1111-1111-111111111501',
    'Template Root',
    'template',
    '00000000-0000-0000-0000-000000000501',
    '11111111-1111-1111-1111-111111111501',
    '{"published": true}'::jsonb,
    4
);

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, parent_task_id, settings, template_version
) VALUES (
    '22222222-2222-2222-2222-222222222501',
    'Template Child',
    'template',
    '00000000-0000-0000-0000-000000000501',
    '11111111-1111-1111-1111-111111111501',
    '11111111-1111-1111-1111-111111111501',
    '{"is_coaching_task": true, "is_strategy_template": true}'::jsonb,
    2
);

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, cloned_from_task_id, settings
) VALUES (
    '33333333-3333-3333-3333-333333333501',
    'Instance Project',
    'instance',
    '00000000-0000-0000-0000-000000000501',
    '33333333-3333-3333-3333-333333333501',
    '11111111-1111-1111-1111-111111111501',
    '{"spawnedFromTemplate": "11111111-1111-1111-1111-111111111501", "cloned_from_template_version": 4, "due_soon_threshold": 7}'::jsonb
);

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, parent_task_id, cloned_from_task_id,
    settings, status, is_locked
) VALUES (
    '44444444-4444-4444-4444-444444444501',
    'Protected Coaching Task',
    'instance',
    '00000000-0000-0000-0000-000000000501',
    '33333333-3333-3333-3333-333333333501',
    '33333333-3333-3333-3333-333333333501',
    '22222222-2222-2222-2222-222222222501',
    '{"is_coaching_task": true, "is_strategy_template": true, "phase_lead_user_ids": []}'::jsonb,
    'todo',
    true
);

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, parent_task_id
) VALUES (
    '55555555-5555-5555-5555-555555555501',
    'Custom Follow-up',
    'instance',
    '00000000-0000-0000-0000-000000000501',
    '33333333-3333-3333-3333-333333333501',
    '33333333-3333-3333-3333-333333333501'
);

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('33333333-3333-3333-3333-333333333501', '00000000-0000-0000-0000-000000000501', 'owner'),
    ('33333333-3333-3333-3333-333333333501', '00000000-0000-0000-0000-000000000502', 'editor'),
    ('33333333-3333-3333-3333-333333333501', '00000000-0000-0000-0000-000000000503', 'coach');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000502', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000502"}', true);

SELECT throws_like(
    $$ UPDATE public.tasks SET title = 'Mutated title' WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    '%protected template scaffold fields cannot be changed%',
    'project editors cannot update scaffold content on cloned template-origin tasks'
);

SELECT throws_like(
    $$ DELETE FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    '%protected template scaffold tasks cannot be deleted%',
    'project editors cannot delete cloned template-origin tasks'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET status = 'in_progress' WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    'project editors can update workflow status on protected scaffold tasks'
);

SELECT is(
    (SELECT status FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444501'),
    'in_progress',
    'allowed workflow status update persists'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET due_date = '2026-06-01 00:00:00+00'::timestamptz,
           notes = 'Runtime note',
           settings = settings || '{"due_soon_threshold": 14}'::jsonb
       WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    'project editors can update dates, notes, and non-protected runtime settings'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET supervisor_email = 'supervisor@example.com'
       WHERE id = '33333333-3333-3333-3333-333333333501' $$,
    'project editors can update supervisor report delivery on protected cloned project roots'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET is_locked = false WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    'phase-unlock style lock-state changes remain allowed on protected scaffold tasks'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET settings = jsonb_set(settings, '{is_coaching_task}', 'false'::jsonb, true)
       WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    '%protected template scaffold settings cannot be changed: is_coaching_task%',
    'project editors cannot mutate protected inherited behavior flags'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET cloned_from_task_id = NULL
       WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    '%protected template scaffold fields cannot be changed%',
    'project editors cannot erase template provenance'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Custom task renamed' WHERE id = '55555555-5555-5555-5555-555555555501' $$,
    'project editors can still update post-instantiation custom tasks'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555501' $$,
    'project editors can still delete post-instantiation custom tasks'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000503', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000503"}', true);

SELECT throws_like(
    $$ UPDATE public.tasks SET title = 'Coach content edit' WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    '%coach role may update only task progress fields%',
    'coach field-scope enforcement blocks protected scaffold content edits before scaffold immutability runs'
);

SET LOCAL ROLE service_role;

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Audited service repair' WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    'service_role maintenance can explicitly repair protected scaffold content'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444501' $$,
    'service_role maintenance can explicitly delete protected scaffold content'
);

SELECT * FROM finish();
ROLLBACK;
