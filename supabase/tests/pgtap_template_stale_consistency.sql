BEGIN;

SELECT plan(6);

TRUNCATE TABLE
    public.activity_log,
    public.admin_users,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'template-stale-admin@example.com',
    'template-stale-standard@example.com',
    'template-stale-owner@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000901', 'template-stale-admin@example.com'),
    ('00000000-0000-0000-0000-000000000902', 'template-stale-standard@example.com'),
    ('00000000-0000-0000-0000-000000000903', 'template-stale-owner@example.com');

INSERT INTO public.admin_users (user_id, email)
VALUES ('00000000-0000-0000-0000-000000000901', 'template-stale-admin@example.com');

INSERT INTO public.tasks (id, title, status, creator, root_id, origin, settings, template_version)
VALUES (
    '99999999-0000-0000-0000-000000000901',
    'Template Stale Source',
    'not_started',
    '00000000-0000-0000-0000-000000000903',
    '99999999-0000-0000-0000-000000000901',
    'template',
    '{"published": true}'::jsonb,
    2
);

INSERT INTO public.tasks (id, title, status, creator, root_id, origin, settings, template_version)
VALUES (
    '99999999-0000-0000-0000-000000000902',
    'Long Running Instance',
    'not_started',
    '00000000-0000-0000-0000-000000000903',
    '99999999-0000-0000-0000-000000000902',
    'instance',
    '{"spawnedFromTemplate": "99999999-0000-0000-0000-000000000901", "cloned_from_template_version": 2, "project_kind": "checkpoint"}'::jsonb,
    1
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000902', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000902"}', true);

SELECT throws_like(
    $$ SELECT * FROM public.admin_template_clones('99999999-0000-0000-0000-000000000901') $$,
    '%unauthorized: admin role required%',
    'non-admin callers cannot inspect template clone drift'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901"}', true);

SELECT is(
    (
        SELECT stale
        FROM public.admin_template_clones('99999999-0000-0000-0000-000000000901')
        WHERE project_id = '99999999-0000-0000-0000-000000000902'
    ),
    false,
    'admin_template_clones reports a freshly stamped instance as current'
);

SET LOCAL ROLE postgres;

UPDATE public.tasks
SET title = 'Template Stale Source Updated'
WHERE id = '99999999-0000-0000-0000-000000000901';

SELECT is(
    (SELECT template_version FROM public.tasks WHERE id = '99999999-0000-0000-0000-000000000901'),
    3,
    'template structural edits bump template_version'
);

SELECT is(
    (SELECT title FROM public.tasks WHERE id = '99999999-0000-0000-0000-000000000902'),
    'Long Running Instance',
    'template edits do not rewrite long-running instance content'
);

SELECT is(
    (SELECT (settings ->> 'cloned_from_template_version')::int FROM public.tasks WHERE id = '99999999-0000-0000-0000-000000000902'),
    2,
    'template edits do not rewrite the instance cloned version stamp'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901"}', true);

SELECT is(
    (
        SELECT stale
        FROM public.admin_template_clones('99999999-0000-0000-0000-000000000901')
        WHERE project_id = '99999999-0000-0000-0000-000000000902'
    ),
    true,
    'admin_template_clones reports the instance stale after the template version bump'
);

SELECT * FROM finish();
ROLLBACK;
