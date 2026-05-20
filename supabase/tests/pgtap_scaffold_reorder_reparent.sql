-- Regression: enforce_template_scaffold_immutability used to block any change
-- to parent_task_id or position on cloned scaffold rows, which silently broke
-- drag-and-drop for every freshly cloned project. parent_task_id and position
-- are now intentionally mutable so planters/team members can rearrange tasks;
-- the rest of the content/provenance fields remain locked.

BEGIN;

SELECT plan(5);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'scaffold-dnd-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000001001', 'scaffold-dnd-owner@example.com');

-- Seed a scaffold-cloned project tree (origin='instance', cloned_from_task_id set).
INSERT INTO public.tasks
    (id, title, origin, creator, root_id, parent_task_id, cloned_from_task_id, status, position)
VALUES
    ('11111111-1111-1111-1111-111111111001', 'Scaffold Project', 'instance',
     '00000000-0000-0000-0000-000000001001',
     '11111111-1111-1111-1111-111111111001', NULL,
     '99999999-9999-9999-9999-999999990001', 'todo', 1000),
    ('22222222-2222-2222-2222-222222221001', 'Phase A', 'instance',
     '00000000-0000-0000-0000-000000001001',
     '11111111-1111-1111-1111-111111111001',
     '11111111-1111-1111-1111-111111111001',
     '99999999-9999-9999-9999-999999990002', 'todo', 1000),
    ('22222222-2222-2222-2222-222222221002', 'Phase B', 'instance',
     '00000000-0000-0000-0000-000000001001',
     '11111111-1111-1111-1111-111111111001',
     '11111111-1111-1111-1111-111111111001',
     '99999999-9999-9999-9999-999999990003', 'todo', 2000),
    ('33333333-3333-3333-3333-333333331001', 'Scaffold Task', 'instance',
     '00000000-0000-0000-0000-000000001001',
     '11111111-1111-1111-1111-111111111001',
     '22222222-2222-2222-2222-222222221001',
     '99999999-9999-9999-9999-999999990004', 'todo', 1000);

-- Reorder within the same parent: just bumping position should be allowed.
SELECT lives_ok(
    $$ UPDATE public.tasks
       SET position = 5000
       WHERE id = '33333333-3333-3333-3333-333333331001' $$,
    'reorder (position-only) is allowed on a scaffold row'
);

-- Reparent across phases: parent_task_id change should be allowed.
SELECT lives_ok(
    $$ UPDATE public.tasks
       SET parent_task_id = '22222222-2222-2222-2222-222222221002',
           position = 1000
       WHERE id = '33333333-3333-3333-3333-333333331001' $$,
    'reparent (parent_task_id change) is allowed on a scaffold row'
);

-- Content/provenance fields must still be locked.
SELECT throws_like(
    $$ UPDATE public.tasks
       SET title = 'Renamed Scaffold Task'
       WHERE id = '33333333-3333-3333-3333-333333331001' $$,
    '%protected template scaffold fields cannot be changed%',
    'renaming a scaffold row is still blocked'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET description = 'New description'
       WHERE id = '33333333-3333-3333-3333-333333331001' $$,
    '%protected template scaffold fields cannot be changed%',
    'editing description on a scaffold row is still blocked'
);

SELECT throws_like(
    $$ UPDATE public.tasks
       SET cloned_from_task_id = '99999999-9999-9999-9999-999999990099'
       WHERE id = '33333333-3333-3333-3333-333333331001' $$,
    '%protected template scaffold fields cannot be changed%',
    'rewriting cloned_from_task_id on a scaffold row is still blocked'
);

SELECT * FROM finish();
ROLLBACK;
