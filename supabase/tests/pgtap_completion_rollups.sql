BEGIN;

SELECT plan(8);

TRUNCATE TABLE
    public.activity_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

INSERT INTO public.tasks (
    id, title, origin, root_id, parent_task_id, status, position, is_locked, prerequisite_phase_id
) VALUES
    (
        '10000000-0000-0000-0000-000000000701',
        'Completion Rollup Project',
        'instance',
        '10000000-0000-0000-0000-000000000701',
        NULL,
        'not_started',
        1,
        false,
        NULL
    ),
    (
        '20000000-0000-0000-0000-000000000701',
        'Prerequisite Phase',
        'instance',
        '10000000-0000-0000-0000-000000000701',
        '10000000-0000-0000-0000-000000000701',
        'not_started',
        1,
        false,
        NULL
    ),
    (
        '20000000-0000-0000-0000-000000000702',
        'Dependent Phase',
        'instance',
        '10000000-0000-0000-0000-000000000701',
        '10000000-0000-0000-0000-000000000701',
        'not_started',
        2,
        true,
        '20000000-0000-0000-0000-000000000701'
    ),
    (
        '30000000-0000-0000-0000-000000000701',
        'Prerequisite Milestone',
        'instance',
        '10000000-0000-0000-0000-000000000701',
        '20000000-0000-0000-0000-000000000701',
        'not_started',
        1,
        false,
        NULL
    ),
    (
        '40000000-0000-0000-0000-000000000701',
        'Prerequisite Task',
        'instance',
        '10000000-0000-0000-0000-000000000701',
        '30000000-0000-0000-0000-000000000701',
        'not_started',
        1,
        false,
        NULL
    );

SELECT is(
    (SELECT is_locked FROM public.tasks WHERE id = '20000000-0000-0000-0000-000000000702'),
    true,
    'dependent phase starts locked'
);

UPDATE public.tasks
SET status = 'completed'
WHERE id = '40000000-0000-0000-0000-000000000701';

SELECT is(
    (SELECT is_complete FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000701'),
    true,
    'status-only completion derives is_complete before AFTER triggers run'
);

SELECT is(
    (SELECT is_locked FROM public.tasks WHERE id = '20000000-0000-0000-0000-000000000702'),
    false,
    'status-only completion unlocks dependent phases'
);

UPDATE public.tasks
SET is_locked = true
WHERE id = '20000000-0000-0000-0000-000000000702';

UPDATE public.tasks
SET status = 'todo',
    is_complete = true
WHERE id = '40000000-0000-0000-0000-000000000701';

SELECT is(
    (SELECT is_complete FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000701'),
    false,
    'mixed non-completed update derives is_complete from status'
);

SELECT is(
    (SELECT is_locked FROM public.tasks WHERE id = '20000000-0000-0000-0000-000000000702'),
    true,
    'mixed non-completed update does not unlock dependent phases'
);

UPDATE public.tasks
SET status = 'completed',
    is_complete = false
WHERE id = '40000000-0000-0000-0000-000000000701';

SELECT is(
    (SELECT is_complete FROM public.tasks WHERE id = '40000000-0000-0000-0000-000000000701'),
    true,
    'mixed completed update derives is_complete from status'
);

SELECT is(
    (SELECT is_locked FROM public.tasks WHERE id = '20000000-0000-0000-0000-000000000702'),
    false,
    'mixed completed update unlocks dependent phases after sync trigger runs'
);

UPDATE public.tasks
SET is_locked = true
WHERE id = '20000000-0000-0000-0000-000000000702';

UPDATE public.tasks
SET status = 'completed'
WHERE id = '20000000-0000-0000-0000-000000000701';

SELECT is(
    (SELECT is_locked FROM public.tasks WHERE id = '20000000-0000-0000-0000-000000000702'),
    false,
    'phase status completion unlocks the next sibling phase'
);

SELECT * FROM finish();
ROLLBACK;
