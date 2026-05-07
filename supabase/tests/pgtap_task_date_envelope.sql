BEGIN;

SELECT plan(12);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'task-date-envelope-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000801', 'task-date-envelope-owner@example.com');

INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status, position)
VALUES
    ('11111111-1111-1111-1111-111111111801', 'Date Envelope Project', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', NULL, 'todo', 1000),
    ('22222222-2222-2222-2222-222222222801', 'Phase One', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', '11111111-1111-1111-1111-111111111801', 'todo', 1000),
    ('33333333-3333-3333-3333-333333333801', 'Milestone One', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', '22222222-2222-2222-2222-222222222801', 'todo', 1000),
    ('33333333-3333-3333-3333-333333333802', 'Milestone Two', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', '22222222-2222-2222-2222-222222222801', 'todo', 2000),
    ('33333333-3333-3333-3333-333333333803', 'Undated Milestone', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', '22222222-2222-2222-2222-222222222801', 'todo', 3000),
    ('44444444-4444-4444-4444-444444444801', 'Bounded Task', 'instance', '00000000-0000-0000-0000-000000000801', '11111111-1111-1111-1111-111111111801', '33333333-3333-3333-3333-333333333801', 'todo', 1000);

CREATE FUNCTION pg_temp.set_task_dates(
    p_task_id uuid,
    p_start_date timestamptz,
    p_due_date timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.tasks
    SET start_date = p_start_date,
        due_date = p_due_date
    WHERE id = p_task_id;
END;
$$;

CREATE FUNCTION pg_temp.reset_parent_envelopes() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_temp.set_task_dates(
        '11111111-1111-1111-1111-111111111801',
        '2026-01-01 00:00:00+00'::timestamptz,
        '2026-01-31 00:00:00+00'::timestamptz
    );
    PERFORM pg_temp.set_task_dates(
        '22222222-2222-2222-2222-222222222801',
        '2026-01-03 00:00:00+00'::timestamptz,
        '2026-01-29 00:00:00+00'::timestamptz
    );
    PERFORM pg_temp.set_task_dates(
        '33333333-3333-3333-3333-333333333801',
        '2026-01-08 00:00:00+00'::timestamptz,
        '2026-01-20 00:00:00+00'::timestamptz
    );
    PERFORM pg_temp.set_task_dates(
        '11111111-1111-1111-1111-111111111801',
        '2026-01-01 00:00:00+00'::timestamptz,
        '2026-01-31 00:00:00+00'::timestamptz
    );
    PERFORM pg_temp.set_task_dates(
        '22222222-2222-2222-2222-222222222801',
        '2026-01-03 00:00:00+00'::timestamptz,
        '2026-01-29 00:00:00+00'::timestamptz
    );
    PERFORM pg_temp.set_task_dates(
        '11111111-1111-1111-1111-111111111801',
        '2026-01-01 00:00:00+00'::timestamptz,
        '2026-01-31 00:00:00+00'::timestamptz
    );
END;
$$;

SELECT pg_temp.reset_parent_envelopes();
SELECT pg_temp.set_task_dates(
    '33333333-3333-3333-3333-333333333802',
    '2026-01-21 00:00:00+00'::timestamptz,
    '2026-01-25 00:00:00+00'::timestamptz
);
SELECT pg_temp.reset_parent_envelopes();
SELECT pg_temp.set_task_dates(
    '44444444-4444-4444-4444-444444444801',
    '2026-01-10 00:00:00+00'::timestamptz,
    '2026-01-15 00:00:00+00'::timestamptz
);
SELECT pg_temp.reset_parent_envelopes();
SELECT pg_temp.set_task_dates(
    '33333333-3333-3333-3333-333333333803',
    NULL,
    NULL
);

INSERT INTO public.project_members (project_id, user_id, role)
VALUES ('11111111-1111-1111-1111-111111111801', '00000000-0000-0000-0000-000000000801', 'owner');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801"}', true);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET due_date = '2026-02-01 00:00:00+00'::timestamptz
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%task dates must stay within parent task dates%',
    'child due date cannot exceed a dated parent envelope'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET start_date = '2026-01-01 00:00:00+00'::timestamptz
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%task dates must stay within parent task dates%',
    'child start date cannot precede a dated parent envelope'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET start_date = '2026-01-19 00:00:00+00'::timestamptz,
           due_date = '2026-01-18 00:00:00+00'::timestamptz
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%due date cannot be before start date%',
    'task due date cannot be before task start date'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET start_date = '2026-01-25 00:00:00+00'::timestamptz,
           due_date = NULL
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%task dates must stay within parent task dates%',
    'child start-only date cannot exceed a dated parent envelope'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET start_date = NULL,
           due_date = '2026-01-05 00:00:00+00'::timestamptz
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%task dates must stay within parent task dates%',
    'child due-only date cannot precede a dated parent envelope'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET start_date = '2026-01-12 00:00:00+00'::timestamptz,
           due_date = '2026-01-18 00:00:00+00'::timestamptz
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'child date updates inside the parent envelope are allowed'
);

SELECT is(
    (SELECT start_date::date FROM public.tasks WHERE id = '33333333-3333-3333-3333-333333333801'),
    '2026-01-12'::date,
    'valid child date edit rolls the parent start date upward'
);

SELECT is(
    (SELECT due_date::date FROM public.tasks WHERE id = '33333333-3333-3333-3333-333333333801'),
    '2026-01-18'::date,
    'valid child date edit rolls the parent due date upward'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET due_date = '2026-01-15 00:00:00+00'::timestamptz
       WHERE id = '33333333-3333-3333-3333-333333333801' $$,
    '%existing child task dates are outside parent task dates%',
    'parent dates cannot shrink around existing child dates'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = '33333333-3333-3333-3333-333333333802'
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    '%task dates must stay within parent task dates%',
    'reparenting a dated task into an incompatible parent envelope is rejected'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET parent_task_id = '33333333-3333-3333-3333-333333333803'
       WHERE id = '44444444-4444-4444-4444-444444444801' $$,
    'reparenting into an undated parent is allowed and can be rolled up'
);

SELECT is(
    (SELECT due_date::date FROM public.tasks WHERE id = '33333333-3333-3333-3333-333333333803'),
    '2026-01-18'::date,
    'undated parent receives rolled-up child due date after a valid reparent'
);

SELECT * FROM finish();
ROLLBACK;
