BEGIN;

SELECT plan(16);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'coach-rbac-owner@example.com',
    'coach-rbac-editor@example.com',
    'coach-rbac-coach@example.com',
    'coach-rbac-viewer@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000601', 'coach-rbac-owner@example.com'),
    ('00000000-0000-0000-0000-000000000602', 'coach-rbac-editor@example.com'),
    ('00000000-0000-0000-0000-000000000603', 'coach-rbac-coach@example.com'),
    ('00000000-0000-0000-0000-000000000604', 'coach-rbac-viewer@example.com');

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, settings, status
) VALUES (
    '11111111-1111-1111-1111-111111111601',
    'Coach RBAC Project',
    'instance',
    '00000000-0000-0000-0000-000000000601',
    '11111111-1111-1111-1111-111111111601',
    '{}'::jsonb,
    'todo'
);

INSERT INTO public.tasks (
    id, title, origin, creator, root_id, parent_task_id, settings, status, priority
) VALUES
    (
        '22222222-2222-2222-2222-222222222601',
        'Coaching Progress Task',
        'instance',
        '00000000-0000-0000-0000-000000000601',
        '11111111-1111-1111-1111-111111111601',
        '11111111-1111-1111-1111-111111111601',
        '{"is_coaching_task": true}'::jsonb,
        'todo',
        'medium'
    ),
    (
        '22222222-2222-2222-2222-222222222602',
        'Plain Task',
        'instance',
        '00000000-0000-0000-0000-000000000601',
        '11111111-1111-1111-1111-111111111601',
        '11111111-1111-1111-1111-111111111601',
        '{}'::jsonb,
        'todo',
        'medium'
    ),
    (
        '22222222-2222-2222-2222-222222222603',
        'Coach Created Coaching Task',
        'instance',
        '00000000-0000-0000-0000-000000000603',
        '11111111-1111-1111-1111-111111111601',
        '11111111-1111-1111-1111-111111111601',
        '{"is_coaching_task": true}'::jsonb,
        'todo',
        'medium'
    ),
    (
        '22222222-2222-2222-2222-222222222604',
        'Coach Created Plain Task',
        'instance',
        '00000000-0000-0000-0000-000000000603',
        '11111111-1111-1111-1111-111111111601',
        '11111111-1111-1111-1111-111111111601',
        '{}'::jsonb,
        'todo',
        'medium'
    );

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111601', '00000000-0000-0000-0000-000000000601', 'owner'),
    ('11111111-1111-1111-1111-111111111601', '00000000-0000-0000-0000-000000000602', 'editor'),
    ('11111111-1111-1111-1111-111111111601', '00000000-0000-0000-0000-000000000603', 'coach'),
    ('11111111-1111-1111-1111-111111111601', '00000000-0000-0000-0000-000000000604', 'viewer');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000603', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000603"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET status = 'completed'
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    'coach can update status on a Coaching-labeled instance task'
);

SELECT is(
    (SELECT status FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222601'),
    'completed',
    'coach status update persists on the Coaching task'
);

SELECT is(
    (SELECT is_complete FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222601'),
    true,
    'completion trigger derives is_complete from the coach status update'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET title = 'Coach renamed content'
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    '%coach role may update only task progress fields%',
    'coach cannot update Coaching task content fields'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET settings = settings || '{"due_soon_threshold": 14}'::jsonb
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    '%coach role may update only task progress fields%',
    'coach cannot mutate Coaching task settings'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET assignee_id = '00000000-0000-0000-0000-000000000601'
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    '%coach role may update only task progress fields%',
    'coach cannot reassign a Coaching task'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET priority = 'high'
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    '%coach role may update only task progress fields%',
    'coach cannot change Coaching task priority'
);

SELECT lives_ok(
    $$ DELETE FROM public.tasks
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    'coach delete attempt is rejected by RLS without deleting the row'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222601'),
    1::bigint,
    'coach cannot delete Coaching tasks'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET status = 'completed'
       WHERE id = '22222222-2222-2222-2222-222222222602' $$,
    'coach non-Coaching status attempt does not gain update access'
);

SELECT is(
    (SELECT status FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222602'),
    'todo',
    'coach cannot update non-Coaching tasks'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET title = 'Creator bypass attempt'
       WHERE id = '22222222-2222-2222-2222-222222222603' $$,
    '%coach role may update only task progress fields%',
    'coach role restriction applies even when the coach is the row creator'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET status = 'completed'
       WHERE id = '22222222-2222-2222-2222-222222222604' $$,
    '%coach role may update only Coaching-labeled instance tasks%',
    'coach creator cannot update a non-Coaching task through the generic creator policy'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000602', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000602"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET title = 'Editor content edit',
           settings = settings || '{"due_soon_threshold": 10}'::jsonb
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    'editor content/settings access is unaffected by coach field restrictions'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000604', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000604"}', true);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET status = 'blocked'
       WHERE id = '22222222-2222-2222-2222-222222222601' $$,
    'viewer status attempt does not gain coach update access'
);

SELECT is(
    (SELECT status FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222601'),
    'completed',
    'viewer cannot update Coaching task progress'
);

SELECT * FROM finish();
ROLLBACK;
