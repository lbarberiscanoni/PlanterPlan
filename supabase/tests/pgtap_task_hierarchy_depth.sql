BEGIN;

SELECT plan(11);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'task-hierarchy-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000701', 'task-hierarchy-owner@example.com');

-- Hierarchy depth is now capped at 10 (project root = depth 0, max descendant
-- depth = 10). Cycle prevention still applies. derive_task_type continues to
-- emit 'subtask' for anything beyond depth 3 — display semantics are unchanged.

INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status, position)
VALUES
    ('11111111-1111-1111-1111-111111111701', 'Hierarchy Project', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', NULL, 'todo', 1000),
    ('22222222-2222-2222-2222-222222222701', 'Phase One', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '11111111-1111-1111-1111-111111111701', 'todo', 1000),
    ('33333333-3333-3333-3333-333333333701', 'Milestone One', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '22222222-2222-2222-2222-222222222701', 'todo', 1000),
    ('44444444-4444-4444-4444-444444444701', 'Task One', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333701', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555701', 'Subtask depth 4', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '44444444-4444-4444-4444-444444444701', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555702', 'Subtask depth 5', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555701', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555703', 'Subtask depth 6', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555702', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555704', 'Subtask depth 7', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555703', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555705', 'Subtask depth 8', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555704', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555706', 'Subtask depth 9', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555705', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555707', 'Subtask depth 10', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555706', 'todo', 1000);

SELECT is(
    public.derive_task_type('44444444-4444-4444-4444-444444444701'),
    'subtask',
    'derive_task_type emits subtask for children of task-depth rows'
);

SELECT is(
    (SELECT task_type FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555701'),
    'subtask',
    'set_task_type stamps inserted depth-4 rows as subtasks'
);

SELECT is(
    (SELECT task_type FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555707'),
    'subtask',
    'derive_task_type continues to emit subtask deep in the tree'
);

SELECT lives_ok(
    $$ INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status)
       VALUES ('66666666-6666-6666-6666-666666666701', 'Allowed Depth-5 Child', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555701', 'todo') $$,
    'inserting a child under a depth-4 subtask is now allowed (depth 5 < cap 10)'
);

SELECT throws_like(
    $$ INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status)
       VALUES ('66666666-6666-6666-6666-666666666702', 'Beyond Max Depth', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555707', 'todo') $$,
    '%task hierarchy depth exceeded%',
    'cannot insert a child under the deepest allowed level (depth 11 > 10)'
);

SELECT throws_like(
    $$ INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status)
       VALUES ('66666666-6666-6666-6666-666666666703', 'Self Parent Attempt', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '66666666-6666-6666-6666-666666666703', 'todo') $$,
    '%task hierarchy cannot parent a task to itself%',
    'cannot insert a task parented to itself'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = id
       WHERE id = '55555555-5555-5555-5555-555555555701' $$,
    '%task hierarchy cannot parent a task to itself%',
    'cannot update a task to parent itself'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = '55555555-5555-5555-5555-555555555707'
       WHERE id = '55555555-5555-5555-5555-555555555701' $$,
    '%task hierarchy cannot parent a task under its own descendant%',
    'cannot create a parent-child cycle through reparenting'
);

SELECT lives_ok(
    $$ INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status)
       VALUES ('77777777-7777-7777-7777-777777777701', 'Another Task', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333701', 'todo') $$,
    'can insert a sibling task at depth 3'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET parent_task_id = '44444444-4444-4444-4444-444444444701'
       WHERE id = '77777777-7777-7777-7777-777777777701' $$,
    'childless task can be reparented under another task as a depth-4 subtask'
);

SELECT is(
    (SELECT task_type FROM public.tasks WHERE id = '77777777-7777-7777-7777-777777777701'),
    'subtask',
    'reparented final-level row is restamped as subtask'
);

SELECT * FROM finish();
ROLLBACK;
