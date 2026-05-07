BEGIN;

SELECT plan(8);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'task-hierarchy-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000701', 'task-hierarchy-owner@example.com');

INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status, position)
VALUES
    ('11111111-1111-1111-1111-111111111701', 'Hierarchy Project', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', NULL, 'todo', 1000),
    ('22222222-2222-2222-2222-222222222701', 'Phase One', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '11111111-1111-1111-1111-111111111701', 'todo', 1000),
    ('22222222-2222-2222-2222-222222222702', 'Phase Two', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '11111111-1111-1111-1111-111111111701', 'todo', 2000),
    ('33333333-3333-3333-3333-333333333701', 'Milestone One', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '22222222-2222-2222-2222-222222222701', 'todo', 1000),
    ('33333333-3333-3333-3333-333333333702', 'Milestone Two', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '22222222-2222-2222-2222-222222222702', 'todo', 1000),
    ('44444444-4444-4444-4444-444444444701', 'Task With Subtask', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333701', 'todo', 1000),
    ('44444444-4444-4444-4444-444444444702', 'Childless Task', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333701', 'todo', 2000),
    ('44444444-4444-4444-4444-444444444703', 'Target Task', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333702', 'todo', 1000),
    ('44444444-4444-4444-4444-444444444704', 'Parent With Existing Child', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '33333333-3333-3333-3333-333333333701', 'todo', 3000),
    ('55555555-5555-5555-5555-555555555701', 'Allowed Subtask', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '44444444-4444-4444-4444-444444444701', 'todo', 1000),
    ('55555555-5555-5555-5555-555555555702', 'Existing Child', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '44444444-4444-4444-4444-444444444704', 'todo', 1000);

SELECT is(
    public.derive_task_type('44444444-4444-4444-4444-444444444701'),
    'subtask',
    'derive_task_type emits subtask for children of task-depth rows'
);

SELECT is(
    (SELECT task_type FROM public.tasks WHERE id = '55555555-5555-5555-5555-555555555701'),
    'subtask',
    'set_task_type stamps inserted final-level rows as subtasks'
);

SELECT throws_like(
    $$ INSERT INTO public.tasks (id, title, origin, creator, root_id, parent_task_id, status)
       VALUES ('66666666-6666-6666-6666-666666666701', 'Grandchild Attempt', 'instance', '00000000-0000-0000-0000-000000000701', '11111111-1111-1111-1111-111111111701', '55555555-5555-5555-5555-555555555701', 'todo') $$,
    '%task hierarchy depth exceeded: subtasks cannot have child tasks%',
    'cannot insert a child under a subtask'
);

SELECT lives_ok(
    $$ UPDATE public.tasks
       SET parent_task_id = '44444444-4444-4444-4444-444444444703'
       WHERE id = '44444444-4444-4444-4444-444444444702' $$,
    'childless task can be reparented under another task as a subtask'
);

SELECT is(
    (SELECT task_type FROM public.tasks WHERE id = '44444444-4444-4444-4444-444444444702'),
    'subtask',
    'reparented final-level row is restamped as subtask'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = '55555555-5555-5555-5555-555555555701'
       WHERE id = '44444444-4444-4444-4444-444444444702' $$,
    '%task hierarchy depth exceeded: subtasks cannot have child tasks%',
    'cannot reparent a task under a subtask'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = '44444444-4444-4444-4444-444444444703'
       WHERE id = '44444444-4444-4444-4444-444444444704' $$,
    '%task hierarchy depth exceeded: subtasks cannot have child tasks%',
    'cannot reparent a task with subtasks where descendants would exceed max depth'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET parent_task_id = '55555555-5555-5555-5555-555555555701'
       WHERE id = '44444444-4444-4444-4444-444444444701' $$,
    '%task hierarchy cannot parent a task under its own descendant%',
    'cannot create a parent-child cycle through reparenting'
);

SELECT * FROM finish();
ROLLBACK;
