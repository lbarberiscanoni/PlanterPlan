-- Verifies calc_task_date_rollup recomputes BOTH the old and new parents when
-- a task is reparented. Regression coverage for the bug where dragging a dated
-- task from phase A to phase B widened B but left A holding stale dates.

BEGIN;

SELECT plan(6);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'task-date-rollup-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000901', 'task-date-rollup-owner@example.com');

-- Hierarchy:
--   Project root
--     ├── Phase A  (will lose its only dated child)
--     │     └── Moving Task (dated 2026-03-10..2026-03-15)
--     └── Phase B  (will receive the moved task)
INSERT INTO public.tasks
    (id, title, origin, creator, root_id, parent_task_id, status, position,
     start_date, due_date)
VALUES
    ('11111111-1111-1111-1111-111111111901', 'Rollup Reparent Project', 'instance',
     '00000000-0000-0000-0000-000000000901',
     '11111111-1111-1111-1111-111111111901', NULL, 'todo', 1000, NULL, NULL),
    ('22222222-2222-2222-2222-222222222901', 'Phase A', 'instance',
     '00000000-0000-0000-0000-000000000901',
     '11111111-1111-1111-1111-111111111901',
     '11111111-1111-1111-1111-111111111901', 'todo', 1000, NULL, NULL),
    ('22222222-2222-2222-2222-222222222902', 'Phase B', 'instance',
     '00000000-0000-0000-0000-000000000901',
     '11111111-1111-1111-1111-111111111901',
     '11111111-1111-1111-1111-111111111901', 'todo', 2000, NULL, NULL),
    ('33333333-3333-3333-3333-333333333901', 'Moving Task', 'instance',
     '00000000-0000-0000-0000-000000000901',
     '11111111-1111-1111-1111-111111111901',
     '22222222-2222-2222-2222-222222222901', 'todo', 1000,
     '2026-03-10 00:00:00+00'::timestamptz,
     '2026-03-15 00:00:00+00'::timestamptz);

-- Insertion of Moving Task should have rolled Phase A up to (03-10, 03-15).
SELECT is(
    (SELECT start_date::date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222901'),
    '2026-03-10'::date,
    'Phase A starts at the moving task start after initial insert'
);

SELECT is(
    (SELECT due_date::date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222901'),
    '2026-03-15'::date,
    'Phase A ends at the moving task due after initial insert'
);

-- Reparent: move the dated task from Phase A to Phase B.
UPDATE public.tasks
SET parent_task_id = '22222222-2222-2222-2222-222222222902',
    position = 1000
WHERE id = '33333333-3333-3333-3333-333333333901';

-- Phase B (new parent) should have rolled up to include the moved task.
SELECT is(
    (SELECT start_date::date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222902'),
    '2026-03-10'::date,
    'Phase B inherits the moved task start via rollup'
);

SELECT is(
    (SELECT due_date::date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222902'),
    '2026-03-15'::date,
    'Phase B inherits the moved task due via rollup'
);

-- Phase A (old parent) should now have NULL dates — no dated children remain.
-- Pre-fix this assertion failed: Phase A retained 2026-03-10..2026-03-15.
SELECT is(
    (SELECT start_date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222901'),
    NULL::timestamptz,
    'Phase A start_date is cleared on reparent (regression)'
);

SELECT is(
    (SELECT due_date FROM public.tasks WHERE id = '22222222-2222-2222-2222-222222222901'),
    NULL::timestamptz,
    'Phase A due_date is cleared on reparent (regression)'
);

SELECT * FROM finish();
ROLLBACK;
