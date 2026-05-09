BEGIN;

SELECT plan(33);

TRUNCATE TABLE
    public.activity_log,
    public.admin_users,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'role-matrix-owner@example.com',
    'role-matrix-editor@example.com',
    'role-matrix-coach@example.com',
    'role-matrix-viewer@example.com',
    'role-matrix-limited@example.com',
    'role-matrix-admin@example.com',
    'role-matrix-outsider@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000801', 'role-matrix-owner@example.com'),
    ('00000000-0000-0000-0000-000000000802', 'role-matrix-editor@example.com'),
    ('00000000-0000-0000-0000-000000000803', 'role-matrix-coach@example.com'),
    ('00000000-0000-0000-0000-000000000804', 'role-matrix-viewer@example.com'),
    ('00000000-0000-0000-0000-000000000805', 'role-matrix-limited@example.com'),
    ('00000000-0000-0000-0000-000000000806', 'role-matrix-admin@example.com'),
    ('00000000-0000-0000-0000-000000000807', 'role-matrix-outsider@example.com');

INSERT INTO public.admin_users (user_id, email, granted_by)
VALUES ('00000000-0000-0000-0000-000000000806', 'role-matrix-admin@example.com', 'pgtap');

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, parent_task_id, settings, status, position, task_type
) VALUES
    (
        '11111111-1111-1111-1111-111111111801',
        'Role Matrix Project',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        NULL,
        '{}'::jsonb,
        'not_started',
        1,
        'project'
    ),
    (
        '22222222-2222-2222-2222-222222222801',
        'Lead Phase',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '11111111-1111-1111-1111-111111111801',
        '{"phase_lead_user_ids": ["00000000-0000-0000-0000-000000000804", "00000000-0000-0000-0000-000000000805"]}'::jsonb,
        'not_started',
        1,
        'phase'
    ),
    (
        '22222222-2222-2222-2222-222222222802',
        'Sibling Phase',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '11111111-1111-1111-1111-111111111801',
        '{}'::jsonb,
        'not_started',
        2,
        'phase'
    ),
    (
        '33333333-3333-3333-3333-333333333801',
        'Lead Milestone',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '22222222-2222-2222-2222-222222222801',
        '{}'::jsonb,
        'not_started',
        1,
        'milestone'
    ),
    (
        '33333333-3333-3333-3333-333333333802',
        'Sibling Milestone',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '22222222-2222-2222-2222-222222222802',
        '{}'::jsonb,
        'not_started',
        1,
        'milestone'
    ),
    (
        '44444444-4444-4444-4444-444444444801',
        'Lead Task',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '33333333-3333-3333-3333-333333333801',
        '{}'::jsonb,
        'not_started',
        1,
        'task'
    ),
    (
        '44444444-4444-4444-4444-444444444802',
        'Sibling Task',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '33333333-3333-3333-3333-333333333802',
        '{}'::jsonb,
        'not_started',
        1,
        'task'
    ),
    (
        '44444444-4444-4444-4444-444444444803',
        'Coaching Task',
        'instance',
        '00000000-0000-0000-0000-000000000801',
        '11111111-1111-1111-1111-111111111801',
        '33333333-3333-3333-3333-333333333801',
        '{"is_coaching_task": true}'::jsonb,
        'not_started',
        2,
        'task'
    );

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000801', 'owner'),
    ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000802', 'editor'),
    ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000803', 'coach'),
    ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000804', 'viewer'),
    ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000805', 'limited');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Owner edited task' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'owner can update task content'
);

SELECT lives_ok(
    $$ INSERT INTO public.tasks (id, root_id, parent_task_id, creator, title, origin, status)
       VALUES ('55555555-5555-5555-5555-555555555801', '11111111-1111-1111-1111-111111111801', '44444444-4444-4444-4444-444444444801', '00000000-0000-0000-0000-000000000801', 'Owner subtask', 'instance', 'not_started') $$,
    'owner can create child tasks'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555801' $$,
    'owner can delete custom child tasks'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks SET description = 'Editor content edit' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'editor can update task content'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET settings = settings || '{"due_soon_threshold": 5}'::jsonb WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'editor settings access is unaffected by phase lead restrictions'
);

SELECT lives_ok(
    $$ INSERT INTO public.tasks (id, root_id, parent_task_id, creator, title, origin, status)
       VALUES ('55555555-5555-5555-5555-555555555802', '11111111-1111-1111-1111-111111111801', '44444444-4444-4444-4444-444444444801', '00000000-0000-0000-0000-000000000802', 'Editor subtask', 'instance', 'not_started') $$,
    'editor can create child tasks'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555802' $$,
    'editor can delete custom child tasks'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000806', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000806"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Admin edited task' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'global admin can update instance tasks without project membership'
);

SELECT lives_ok(
    $$ INSERT INTO public.tasks (id, root_id, parent_task_id, creator, title, origin, status)
       VALUES ('55555555-5555-5555-5555-555555555806', '11111111-1111-1111-1111-111111111801', '44444444-4444-4444-4444-444444444801', '00000000-0000-0000-0000-000000000806', 'Admin subtask', 'instance', 'not_started') $$,
    'global admin can create instance child tasks without project membership'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555806' $$,
    'global admin can delete instance tasks without project membership'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000804', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000804"}', true);

SELECT is(
    (SELECT count(*) FROM public.tasks),
    8::bigint,
    'viewer can read project tasks'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Viewer lead content edit' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'viewer phase lead can update content on descendant tasks'
);

SELECT is(
    (SELECT title FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444801'),
    'Viewer lead content edit',
    'viewer phase lead content update persists'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Viewer sibling edit attempt' WHERE id = '44444444-4444-4444-4444-444444444802' $$,
    'viewer non-lead sibling update is rejected by RLS without mutating'
);

SELECT isnt(
    (SELECT title FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444802'),
    'Viewer sibling edit attempt',
    'viewer cannot update tasks outside their lead scope'
);

SELECT throws_like(
    $$ UPDATE public.tasks SET settings = settings || '{"phase_lead_user_ids": ["00000000-0000-0000-0000-000000000804"]}'::jsonb WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%phase lead role may update only task content, schedule, and progress fields%',
    'viewer phase lead cannot mutate protected settings'
);

SELECT throws_like(
    $$ UPDATE public.tasks SET parent_task_id = '33333333-3333-3333-3333-333333333802' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%phase lead role may update only task content, schedule, and progress fields%',
    'viewer phase lead cannot reparent tasks'
);

SELECT throws_ok(
    $$ INSERT INTO public.tasks (id, root_id, parent_task_id, creator, title, origin, status)
       VALUES ('55555555-5555-5555-5555-555555555804', '11111111-1111-1111-1111-111111111801', '44444444-4444-4444-4444-444444444801', '00000000-0000-0000-0000-000000000804', 'Viewer subtask attempt', 'instance', 'not_started') $$,
    'new row violates row-level security policy for table "tasks"',
    'viewer phase lead child insert is rejected by RLS'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555804'),
    0::bigint,
    'viewer phase lead cannot create child tasks'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'viewer phase lead delete is rejected by RLS without deleting'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444801'),
    1::bigint,
    'viewer phase lead cannot delete tasks'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000805', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000805"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks SET status = 'completed' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'limited phase lead can update task progress'
);

SELECT is(
    (SELECT is_complete FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444801'),
    true,
    'limited phase lead status update keeps completion flags in sync'
);

SELECT throws_like(
    $$ UPDATE public.tasks SET assignee_id = '00000000-0000-0000-0000-000000000805' WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%phase lead role may update only task content, schedule, and progress fields%',
    'limited phase lead cannot reassign tasks'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Limited phase self edit attempt' WHERE id = '22222222-2222-2222-2222-222222222801' $$,
    'limited phase lead self-row update is rejected by RLS without mutating'
);

SELECT isnt(
    (SELECT title FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222801'),
    'Limited phase self edit attempt',
    'limited phase lead cannot edit the phase row that grants lead scope'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000803', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000803"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks SET status = 'in_progress' WHERE id = '44444444-4444-4444-4444-444444444803' $$,
    'coach can update progress on Coaching tasks'
);

SELECT throws_like(
    $$ UPDATE public.tasks SET title = 'Coach content edit attempt' WHERE id = '44444444-4444-4444-4444-444444444803' $$,
    '%coach role may update only task progress fields%',
    'coach cannot update Coaching task content'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET status = 'blocked' WHERE id = '44444444-4444-4444-4444-444444444802' $$,
    'coach non-Coaching status update is rejected by RLS without mutating'
);

SELECT is(
    (SELECT status FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444802'),
    'not_started',
    'coach cannot update non-Coaching tasks'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000807', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000807"}', true);

SELECT is(
    (SELECT count(*) FROM public.tasks),
    0::bigint,
    'outsider cannot read project tasks'
);

SELECT lives_ok(
    $$ UPDATE public.tasks SET title = 'Outsider edit attempt' WHERE id = '44444444-4444-4444-4444-444444444802' $$,
    'outsider update is rejected by RLS without mutating'
);

SET LOCAL ROLE postgres;

SELECT isnt(
    (SELECT title FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444802'),
    'Outsider edit attempt',
    'outsider cannot update project tasks'
);

SELECT * FROM finish();
ROLLBACK;
