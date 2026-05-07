BEGIN;

SELECT plan(13);

TRUNCATE TABLE
    public.activity_log,
    public.notification_log,
    public.task_comments,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'comment-owner@example.com',
    'comment-author@example.com',
    'comment-recipient@example.com',
    'comment-outsider@example.com'
);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    ('00000000-0000-0000-0000-000000000701', 'comment-owner@example.com', '{"full_name":"Project Owner"}'::jsonb),
    ('00000000-0000-0000-0000-000000000702', 'comment-author@example.com', '{"full_name":"Comment Author"}'::jsonb),
    ('00000000-0000-0000-0000-000000000703', 'comment-recipient@example.com', '{"full_name":"Mention Recipient"}'::jsonb),
    ('00000000-0000-0000-0000-000000000704', 'comment-outsider@example.com', '{"full_name":"Outsider"}'::jsonb);

INSERT INTO public.tasks (id, title, status, creator, root_id, origin)
VALUES (
    '11111111-1111-1111-1111-111111111701',
    'Comment Project',
    'not_started',
    '00000000-0000-0000-0000-000000000701',
    '11111111-1111-1111-1111-111111111701',
    'instance'
);

INSERT INTO public.tasks (id, root_id, parent_task_id, title, status, creator, origin)
VALUES (
    '22222222-2222-2222-2222-222222222701',
    '11111111-1111-1111-1111-111111111701',
    '11111111-1111-1111-1111-111111111701',
    'Commented task',
    'todo',
    '00000000-0000-0000-0000-000000000701',
    'instance'
);

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111701', '00000000-0000-0000-0000-000000000701', 'owner'),
    ('11111111-1111-1111-1111-111111111701', '00000000-0000-0000-0000-000000000702', 'editor'),
    ('11111111-1111-1111-1111-111111111701', '00000000-0000-0000-0000-000000000703', 'viewer');

INSERT INTO public.task_comments (id, task_id, author_id, body, mentions)
VALUES (
    '33333333-3333-3333-3333-333333333701',
    '22222222-2222-2222-2222-222222222701',
    '00000000-0000-0000-0000-000000000702',
    'Hello @recipient from comment author',
    ARRAY[
        '00000000-0000-0000-0000-000000000703',
        '00000000-0000-0000-0000-000000000703',
        '00000000-0000-0000-0000-000000000702',
        'not-a-uuid'
    ]::text[]
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701"}', true);

SELECT is(
    (SELECT count(*) FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701')),
    1::bigint,
    'project member can list task comments through the author hydration RPC'
);

SELECT is(
    (SELECT author ->> 'email' FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701') LIMIT 1),
    'comment-author@example.com',
    'author DTO hydrates auth user email'
);

SELECT is(
    (SELECT author #>> '{user_metadata,full_name}' FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701') LIMIT 1),
    'Comment Author',
    'author DTO hydrates auth user metadata'
);

RESET ROLE;

SELECT is(
    (SELECT count(*) FROM public.notification_log WHERE event_type = 'mention_pending'),
    1::bigint,
    'mention trigger enqueues one recipient, deduping duplicates and skipping self/invalid values'
);

SELECT is(
    (SELECT user_id::text FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '00000000-0000-0000-0000-000000000703',
    'notification row recipient is the mentioned user'
);

SELECT is(
    (SELECT payload ->> 'recipient_id' FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '00000000-0000-0000-0000-000000000703',
    'mention payload includes recipient_id'
);

SELECT is(
    (SELECT payload ->> 'actor_id' FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '00000000-0000-0000-0000-000000000702',
    'mention payload includes actor_id'
);

SELECT is(
    (SELECT payload ->> 'comment_id' FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '33333333-3333-3333-3333-333333333701',
    'mention payload includes comment_id'
);

SELECT is(
    (SELECT payload ->> 'task_id' FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '22222222-2222-2222-2222-222222222701',
    'mention payload includes task_id'
);

SELECT is(
    (SELECT payload ->> 'project_id' FROM public.notification_log WHERE event_type = 'mention_pending' LIMIT 1),
    '11111111-1111-1111-1111-111111111701',
    'mention payload includes project_id'
);

DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-000000000702';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000701', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000701"}', true);

SELECT is(
    (SELECT author_id::text FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701') LIMIT 1),
    NULL::text,
    'deleted authors hydrate with null author_id'
);

SELECT is(
    (SELECT author::text FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701') LIMIT 1),
    NULL::text,
    'deleted authors hydrate with null author DTO'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000704', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000704"}', true);

SELECT throws_like(
    $$ SELECT count(*) FROM public.list_task_comments_with_authors('22222222-2222-2222-2222-222222222701') $$,
    '%unauthorized: project membership required%',
    'non-members cannot use the SECURITY DEFINER author hydration RPC'
);

SELECT * FROM finish();
ROLLBACK;
