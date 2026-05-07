BEGIN;

SELECT plan(8);

TRUNCATE TABLE
    public.activity_log,
    public.admin_users
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'admin-moderation-admin@example.com',
    'admin-moderation-standard@example.com',
    'admin-moderation-target@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000801', 'admin-moderation-admin@example.com'),
    ('00000000-0000-0000-0000-000000000802', 'admin-moderation-standard@example.com'),
    ('00000000-0000-0000-0000-000000000803', 'admin-moderation-target@example.com');

INSERT INTO public.admin_users (user_id, email)
VALUES ('00000000-0000-0000-0000-000000000801', 'admin-moderation-admin@example.com');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000802', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000802"}', true);

SELECT throws_like(
    $$ SELECT public.admin_set_user_admin_role('00000000-0000-0000-0000-000000000803', true) $$,
    '%unauthorized: admin role required%',
    'non-admin callers cannot grant platform-admin role through the RPC'
);

SELECT throws_like(
    $$ INSERT INTO public.admin_users (user_id, email) VALUES ('00000000-0000-0000-0000-000000000804', 'blocked@example.com') $$,
    '%permission denied%',
    'authenticated callers cannot mutate admin_users directly'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801"}', true);

SELECT lives_ok(
    $$ SELECT public.admin_set_user_admin_role('00000000-0000-0000-0000-000000000803', true) $$,
    'admin callers can grant platform-admin role through the RPC'
);

SET LOCAL ROLE postgres;

SELECT ok(
    EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = '00000000-0000-0000-0000-000000000803'
    ),
    'grant inserts the target into admin_users'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.activity_log
        WHERE actor_id = '00000000-0000-0000-0000-000000000801'
          AND entity_id = '00000000-0000-0000-0000-000000000803'
          AND action = 'admin_granted'
    ),
    1::bigint,
    'admin grant writes an audit row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000801', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000801"}', true);

SELECT throws_like(
    $$ SELECT public.admin_set_user_admin_role('00000000-0000-0000-0000-000000000801', false) $$,
    '%self_demotion_forbidden%',
    'admin callers cannot revoke their own platform-admin role through the RPC'
);

SELECT lives_ok(
    $$ SELECT public.admin_set_user_admin_role('00000000-0000-0000-0000-000000000803', false) $$,
    'admin callers can revoke another user platform-admin role through the RPC'
);

SET LOCAL ROLE postgres;

SELECT ok(
    NOT EXISTS (
        SELECT 1
        FROM public.admin_users
        WHERE user_id = '00000000-0000-0000-0000-000000000803'
    ),
    'revoke removes the target from admin_users'
);

SELECT * FROM finish();
ROLLBACK;
