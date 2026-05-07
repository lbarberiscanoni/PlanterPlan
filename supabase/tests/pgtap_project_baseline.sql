BEGIN;

SELECT plan(18);

TRUNCATE TABLE public.activity_log, public.task_comments, public.project_members, public.task_resources, public.tasks CASCADE;
DELETE FROM auth.users
WHERE email IN (
    'projectbaseline@example.com',
    'clonebaseline@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000301', 'projectbaseline@example.com'),
    ('00000000-0000-0000-0000-000000000302', 'clonebaseline@example.com');

CREATE TEMP TABLE rpc_results (
    name text PRIMARY KEY,
    payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON TABLE rpc_results TO authenticated;

INSERT INTO public.tasks (id, title, status, creator, root_id, origin)
VALUES (
    '11111111-1111-1111-1111-111111111301',
    'Blank Project Baseline',
    'not_started',
    '00000000-0000-0000-0000-000000000301',
    '11111111-1111-1111-1111-111111111301',
    'instance'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301"}', true);

INSERT INTO rpc_results (name, payload)
SELECT 'initialize_default_project',
       public.initialize_default_project(
           '11111111-1111-1111-1111-111111111301'::uuid,
           '00000000-0000-0000-0000-000000000301'::uuid
       );

SET LOCAL ROLE postgres;

SELECT is(
    (SELECT payload ->> 'success' FROM rpc_results WHERE name = 'initialize_default_project'),
    'true',
    'initialize_default_project reports success for a blank project root'
);

SELECT is(
    (SELECT (payload ->> 'tasks_created')::int FROM rpc_results WHERE name = 'initialize_default_project'),
    26,
    'initialize_default_project reports the current 26 leaf task scaffold baseline'
);

SELECT is(
    (SELECT count(*) FROM public.project_members WHERE project_id = '11111111-1111-1111-1111-111111111301' AND user_id = '00000000-0000-0000-0000-000000000301' AND role = 'owner'),
    1::bigint,
    'initialize_default_project creates an owner membership for the creator'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE root_id = '11111111-1111-1111-1111-111111111301'),
    51::bigint,
    'initialize_default_project creates the root plus the current 50 child-row scaffold baseline'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE root_id = '11111111-1111-1111-1111-111111111301' AND parent_task_id = '11111111-1111-1111-1111-111111111301'),
    6::bigint,
    'initialize_default_project creates the current six phase baseline'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.tasks task
        JOIN public.tasks milestone ON milestone.id = task.parent_task_id
        JOIN public.tasks phase ON phase.id = milestone.parent_task_id
        WHERE task.root_id = '11111111-1111-1111-1111-111111111301'
          AND phase.parent_task_id = '11111111-1111-1111-1111-111111111301'
    ),
    26::bigint,
    'initialize_default_project creates the current 26 leaf task rows below milestones'
);

INSERT INTO public.tasks (id, title, status, creator, root_id, origin, settings, notes, start_date, position, template_version)
VALUES (
    '22222222-2222-2222-2222-222222222301',
    'Template Root Baseline',
    'not_started',
    '00000000-0000-0000-0000-000000000302',
    '22222222-2222-2222-2222-222222222301',
    'template',
    '{"published": true, "project_kind": "checkpoint", "recurrence": {"kind": "weekly"}, "is_coaching_task": true, "is_strategy_template": true}'::jsonb,
    'root template note',
    '2026-01-01 00:00:00+00',
    1,
    7
);

INSERT INTO public.tasks (id, parent_task_id, root_id, title, status, creator, origin, notes, settings, position)
VALUES (
    '22222222-2222-2222-2222-222222222302',
    '22222222-2222-2222-2222-222222222301',
    '22222222-2222-2222-2222-222222222301',
    'Template Child Baseline',
    'not_started',
    '00000000-0000-0000-0000-000000000302',
    'template',
    'child template note',
    '{"is_coaching_task": true, "is_strategy_template": true, "recurrence": {"kind": "monthly"}}'::jsonb,
    2
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000302', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000302"}', true);

INSERT INTO rpc_results (name, payload)
SELECT 'clone_project_template',
       public.clone_project_template(
           '22222222-2222-2222-2222-222222222301'::uuid,
           NULL::uuid,
           'instance',
           '00000000-0000-0000-0000-000000000302'::uuid,
           'Cloned Project Baseline',
           'Cloned description',
           '2026-02-01 00:00:00+00'::timestamptz,
           '2026-02-01 00:00:00+00'::timestamptz
       );

SET LOCAL ROLE postgres;

SELECT is(
    (SELECT (payload ->> 'tasks_cloned')::int FROM rpc_results WHERE name = 'clone_project_template'),
    2,
    'clone_project_template currently clones the selected two-row subtree'
);

SELECT is(
    (SELECT title FROM public.tasks WHERE id = ((SELECT payload ->> 'new_root_id' FROM rpc_results WHERE name = 'clone_project_template')::uuid)),
    'Cloned Project Baseline',
    'clone_project_template applies the root title override'
);

SELECT is(
    (SELECT origin FROM public.tasks WHERE id = ((SELECT payload ->> 'new_root_id' FROM rpc_results WHERE name = 'clone_project_template')::uuid)),
    'instance',
    'clone_project_template applies the requested new origin to the clone root'
);

SELECT is(
    (SELECT count(*) FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222302'),
    1::bigint,
    'clone_project_template stamps cloned_from_task_id on cloned descendants'
);

SELECT is(
    (SELECT COALESCE(notes, '') FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222301'),
    '',
    'clone_project_template clears root template notes on instance clones'
);

SELECT is(
    (SELECT COALESCE(notes, '') FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222302'),
    '',
    'clone_project_template clears child template notes on instance clones'
);

SELECT is(
    (SELECT settings ->> 'project_kind' FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222301'),
    'checkpoint',
    'clone_project_template preserves root project_kind on instance clones'
);

SELECT is(
    (SELECT settings ->> 'spawnedFromTemplate' FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222301'),
    '22222222-2222-2222-2222-222222222301',
    'clone_project_template stamps spawnedFromTemplate on the cloned root during insert'
);

SELECT is(
    (SELECT (settings ->> 'cloned_from_template_version')::int FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222301'),
    7,
    'clone_project_template stamps the source template_version on the cloned root during insert'
);

SELECT ok(
    (SELECT (settings ->> 'is_coaching_task')::boolean FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222302'),
    'clone_project_template preserves child coaching behavior flag on instance clones'
);

SELECT ok(
    (SELECT (settings ->> 'is_strategy_template')::boolean FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222302'),
    'clone_project_template preserves child strategy behavior flag on instance clones'
);

SELECT ok(
    (SELECT NOT COALESCE(settings ? 'recurrence', false) FROM public.tasks WHERE cloned_from_task_id = '22222222-2222-2222-2222-222222222302'),
    'clone_project_template does not copy unapproved recurrence settings into instance clones'
);

SELECT * FROM finish();
ROLLBACK;
