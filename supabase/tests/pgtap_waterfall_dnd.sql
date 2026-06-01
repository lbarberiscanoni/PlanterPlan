-- Waterfall date-engine x DnD test matrix.
--
-- Verifies that the trg_waterfall_recompute trigger correctly cascades dates
-- under the user-action mutations that DnD generates: reorder, reparent,
-- create, delete, duration edits. Each scenario starts from a fixed 4-level
-- fixture (project → phase → milestones → tasks → subtasks), applies one
-- UPDATE/INSERT/DELETE matching the DnD payload, and asserts the resulting
-- dates at every affected level.
--
-- Fixture geometry (chosen so every scenario has clear expected values):
--
--   Project    P     start = 2026-01-01
--   Phase      A
--   Milestone  M1
--     Task     T1    S1 (2d), S2 (3d)  → T1 = 5d
--     Task     T2    S3 (1d), S4 (4d)  → T2 = 5d
--                                       M1 = 10d
--   Milestone  M2
--     Task     T3    S5 (2d)           → T3 = 2d
--     Task     T4    S6 (3d)           → T4 = 3d
--                                       M2 = 5d
--                                       Phase A = 15d
--                                       Project = 15d

BEGIN;

SELECT plan(28);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users WHERE email = 'waterfall-dnd-owner@example.com';

INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000a01', 'waterfall-dnd-owner@example.com');

-- Project root with start_date set; everything else cascades from here.
INSERT INTO public.tasks
    (id, title, origin, creator, root_id, parent_task_id, status, position, days_from_start, start_date)
VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', 'Project P',  'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', NULL,                                                  'todo', 100, 0, '2026-01-01'::timestamptz),
    ('aaaaaaaa-0000-0000-0000-000000000002', 'Phase A',    'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',                'todo', 100, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000003', 'Milestone M1','instance','00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',                'todo', 100, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000004', 'Milestone M2','instance','00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',                'todo', 200, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000011', 'Task T1',    'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003',                'todo', 100, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000012', 'Task T2',    'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003',                'todo', 200, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000013', 'Task T3',    'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004',                'todo', 100, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000014', 'Task T4',    'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000004',                'todo', 200, 0, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000101', 'Subtask S1', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000011',                'todo', 100, 2, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000102', 'Subtask S2', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000011',                'todo', 200, 3, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000103', 'Subtask S3', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000012',                'todo', 100, 1, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000104', 'Subtask S4', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000012',                'todo', 200, 4, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000105', 'Subtask S5', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000013',                'todo', 100, 2, NULL),
    ('aaaaaaaa-0000-0000-0000-000000000106', 'Subtask S6', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000014',                'todo', 100, 3, NULL);

-- The fixture inserts above already triggered the waterfall recompute, but
-- the inserts arrive in parent-first order so the cascade lands clean.
-- Force a final root-level recompute to be deterministic.
SELECT public.recompute_project_dates_waterfall('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

-- Helper: fetch a task's due_date as a date.
CREATE OR REPLACE FUNCTION pg_temp.due(p_id uuid) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT (due_date AT TIME ZONE 'UTC')::date FROM public.tasks WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION pg_temp.starts(p_id uuid) RETURNS date
LANGUAGE sql STABLE AS $$
    SELECT (start_date AT TIME ZONE 'UTC')::date FROM public.tasks WHERE id = p_id;
$$;

-- =========================================================================
-- BASELINE: dates after the initial cascade.
-- =========================================================================
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-06'::date,
    'baseline: T1 due = start (1/1) + S1(2d) + S2(3d) = 1/6');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-11'::date,
    'baseline: M1 due = T1(1/6) + T2(5d) = 1/11');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000004'::uuid), '2026-01-16'::date,
    'baseline: M2 due = M1(1/11) + T3(2d) + T4(3d) = 1/16');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-16'::date,
    'baseline: project due = last phase end = 1/16');

-- =========================================================================
-- SCENARIO 1: Reorder S1 and S2 within Task T1.
--   Bring S2 (3d) above S1 (2d). T1 duration stays 5d → all ancestors unchanged.
-- =========================================================================
SAVEPOINT scenario;

UPDATE public.tasks SET position = 50 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102'::uuid;

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000102'::uuid), '2026-01-04'::date,
    'S1: S2 now first → S2 due = 1/1 + 3d = 1/4');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000101'::uuid), '2026-01-06'::date,
    'S1: S1 now second → S1 due = 1/4 + 2d = 1/6');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-06'::date,
    'S1: T1 due unchanged (sum preserved)');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-16'::date,
    'S1: project due unchanged');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 2: Move S2 from T1 to T2.
--   T1 contracts: S1(2d) only = 2d. T2 extends: S3(1d) + S4(4d) + S2(3d) = 8d.
--   M1 still 10d (2+8). Phase still 15d. Project unchanged.
-- =========================================================================
SAVEPOINT scenario;

UPDATE public.tasks
SET parent_task_id = 'aaaaaaaa-0000-0000-0000-000000000012'::uuid,
    position = 300
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102'::uuid;

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-03'::date,
    'S2: T1 contracts to S1 only → 1/1 + 2d = 1/3');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000012'::uuid), '2026-01-11'::date,
    'S2: T2 extends → 1/3 + S3(1d) + S4(4d) + S2(3d) = 1/11');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-11'::date,
    'S2: M1 unchanged (sum of T1+T2 = 10d still)');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-16'::date,
    'S2: project unchanged');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 3: Reorder Task T1 and T2 within Milestone M1.
--   T2 first then T1. M1 still 10d. Internal sub-dates flip.
-- =========================================================================
SAVEPOINT scenario;

UPDATE public.tasks SET position = 50 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000012'::uuid;

SELECT is(pg_temp.starts('aaaaaaaa-0000-0000-0000-000000000012'::uuid), '2026-01-01'::date,
    'S3: T2 now first → starts at milestone start (1/1)');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000012'::uuid), '2026-01-06'::date,
    'S3: T2 due = 1/1 + 5d');
SELECT is(pg_temp.starts('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-06'::date,
    'S3: T1 now second → starts where T2 ends');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-11'::date,
    'S3: M1 unchanged');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 4: Move Task T3 from Milestone M2 to Milestone M1.
--   M1 extends: T1(5d) + T2(5d) + T3(2d) = 12d.
--   M2 contracts: T4(3d) only = 3d.
--   Phase still 15d (12+3). Project unchanged.
-- =========================================================================
SAVEPOINT scenario;

UPDATE public.tasks
SET parent_task_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
    position = 300
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000013'::uuid;

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-13'::date,
    'S4: M1 extends → 1/1 + 12d = 1/13');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000004'::uuid), '2026-01-16'::date,
    'S4: M2 contracts but starts at M1.due → 1/13 + 3d = 1/16');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-16'::date,
    'S4: project due unchanged (Phase A total preserved)');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 12: Edit a subtask's duration.
--   Bump S1 from 2d to 5d. T1 = 5d+3d = 8d. M1 = 8+5 = 13d. M2 starts later
--   but its own duration is unchanged (5d). Phase = 13+5 = 18d.
-- =========================================================================
SAVEPOINT scenario;

UPDATE public.tasks SET days_from_start = 5 WHERE id = 'aaaaaaaa-0000-0000-0000-000000000101'::uuid;

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-09'::date,
    'S12: T1 due = 1/1 + S1(5d) + S2(3d) = 1/9');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-14'::date,
    'S12: M1 due = 1/1 + 13d = 1/14');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-19'::date,
    'S12: project extends → 1/1 + 18d = 1/19');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 13: Create a new subtask under T1 with duration 4.
--   T1 = 2+3+4 = 9d. M1 = 9+5 = 14d. Phase = 14+5 = 19d.
-- =========================================================================
SAVEPOINT scenario;

INSERT INTO public.tasks
    (id, title, origin, creator, root_id, parent_task_id, status, position, days_from_start)
VALUES
    ('aaaaaaaa-0000-0000-0000-0000000001ff', 'New Subtask', 'instance', '00000000-0000-0000-0000-000000000a01',
     'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000011', 'todo', 300, 4);

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-10'::date,
    'S13: T1 extends → 1/1 + 9d = 1/10');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-20'::date,
    'S13: project extends → 1/1 + 19d = 1/20');

ROLLBACK TO SAVEPOINT scenario;

-- =========================================================================
-- SCENARIO 14: Delete subtask S2.
--   T1 = 2d only. M1 = 2+5 = 7d. Phase = 7+5 = 12d.
-- =========================================================================
SAVEPOINT scenario;

DELETE FROM public.tasks WHERE id = 'aaaaaaaa-0000-0000-0000-000000000102'::uuid;

SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000011'::uuid), '2026-01-03'::date,
    'S14: T1 contracts → 1/1 + 2d = 1/3');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000003'::uuid), '2026-01-08'::date,
    'S14: M1 contracts → 1/1 + 7d = 1/8');
SELECT is(pg_temp.due('aaaaaaaa-0000-0000-0000-000000000001'::uuid), '2026-01-13'::date,
    'S14: project contracts → 1/1 + 12d = 1/13');

ROLLBACK TO SAVEPOINT scenario;

SELECT * FROM finish();
ROLLBACK;
