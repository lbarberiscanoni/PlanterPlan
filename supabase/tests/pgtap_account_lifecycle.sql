BEGIN;

SELECT plan(12);

TRUNCATE TABLE
    public.activity_log,
    public.notification_log,
    public.push_subscriptions,
    public.ics_feed_tokens,
    public.notification_preferences,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'lifecycle-owner@example.com',
    'lifecycle-deleted@example.com',
    'lifecycle-other@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000401', 'lifecycle-owner@example.com'),
    ('00000000-0000-0000-0000-000000000402', 'lifecycle-deleted@example.com'),
    ('00000000-0000-0000-0000-000000000403', 'lifecycle-other@example.com');

INSERT INTO public.tasks (id, title, status, creator, assignee_id, root_id, origin)
VALUES (
    '11111111-1111-1111-1111-111111111401',
    'Lifecycle Project',
    'not_started',
    '00000000-0000-0000-0000-000000000401',
    '00000000-0000-0000-0000-000000000402',
    '11111111-1111-1111-1111-111111111401',
    'instance'
);

INSERT INTO public.tasks (id, root_id, parent_task_id, title, status, creator, assignee_id, origin)
VALUES (
    '22222222-2222-2222-2222-222222222401',
    '11111111-1111-1111-1111-111111111401',
    '11111111-1111-1111-1111-111111111401',
    'Deleted user authored task',
    'todo',
    '00000000-0000-0000-0000-000000000402',
    '00000000-0000-0000-0000-000000000402',
    'instance'
);

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111401', '00000000-0000-0000-0000-000000000401', 'owner'),
    ('11111111-1111-1111-1111-111111111401', '00000000-0000-0000-0000-000000000402', 'editor');

INSERT INTO public.task_comments (id, task_id, author_id, body)
VALUES (
    '33333333-3333-3333-3333-333333333401',
    '22222222-2222-2222-2222-222222222401',
    '00000000-0000-0000-0000-000000000402',
    'Historical comment survives account deletion'
);

INSERT INTO public.push_subscriptions (id, user_id, endpoint, p256dh, auth)
VALUES (
    '44444444-4444-4444-4444-444444444401',
    '00000000-0000-0000-0000-000000000402',
    'https://push.example/lifecycle',
    'p256dh-lifecycle',
    'auth-lifecycle'
);

INSERT INTO public.ics_feed_tokens (id, user_id, token, label)
VALUES (
    '55555555-5555-5555-5555-555555555401',
    '00000000-0000-0000-0000-000000000402',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'Lifecycle token'
);

INSERT INTO public.notification_log (id, user_id, channel, event_type, payload)
VALUES (
    '66666666-6666-6666-6666-666666666401',
    '00000000-0000-0000-0000-000000000402',
    'email',
    'mention_pending',
    '{}'::jsonb
);

SELECT lives_ok(
    $$ DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000402' $$,
    'auth user deletion succeeds when the user authored comments, created tasks, assignments, memberships, and private rows'
);

SELECT is(
    (SELECT author_id::text FROM public.task_comments WHERE id = '33333333-3333-3333-3333-333333333401'),
    NULL::text,
    'historical comments survive with author_id nulled'
);

SELECT is(
    (SELECT creator::text FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222401'),
    NULL::text,
    'historical tasks survive with creator nulled'
);

SELECT is(
    (SELECT assignee_id::text FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222401'),
    NULL::text,
    'historical task assignments are cleared when the assigned user is deleted'
);

SELECT is(
    (SELECT assignee_id::text FROM public.tasks WHERE id = '11111111-1111-1111-1111-111111111401'),
    NULL::text,
    'root task assignment references are cleared when the assigned user is deleted'
);

SELECT is(
    (SELECT count(*) FROM public.project_members WHERE user_id = '00000000-0000-0000-0000-000000000402'),
    0::bigint,
    'deleted users are removed from project memberships by cascade'
);

SELECT is(
    (SELECT count(*) FROM public.notification_preferences WHERE user_id = '00000000-0000-0000-0000-000000000402'),
    0::bigint,
    'deleted users lose notification preferences by cascade'
);

SELECT is(
    (SELECT count(*) FROM public.push_subscriptions WHERE user_id = '00000000-0000-0000-0000-000000000402'),
    0::bigint,
    'deleted users lose push subscriptions by cascade'
);

SELECT is(
    (SELECT count(*) FROM public.ics_feed_tokens WHERE user_id = '00000000-0000-0000-0000-000000000402'),
    0::bigint,
    'deleted users lose ICS feed tokens by cascade'
);

SELECT is(
    (SELECT count(*) FROM public.notification_log WHERE user_id = '00000000-0000-0000-0000-000000000402'),
    0::bigint,
    'deleted users lose private notification log rows by cascade'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000403', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000403"}', true);

SELECT throws_like(
    $$ DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000401' $$,
    '%permission denied%',
    'authenticated users cannot delete arbitrary auth.users rows'
);

SET LOCAL ROLE postgres;

SELECT is(
    (SELECT count(*) FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000401'),
    1::bigint,
    'failed arbitrary auth.users delete leaves the target account intact'
);

SELECT * FROM finish();
ROLLBACK;
