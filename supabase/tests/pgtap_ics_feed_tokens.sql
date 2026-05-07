BEGIN;

SELECT plan(13);

TRUNCATE TABLE
    public.admin_users,
    public.ics_feed_tokens,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'ics-owner@example.com',
    'ics-other@example.com',
    'ics-admin@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000000901', 'ics-owner@example.com'),
    ('00000000-0000-0000-0000-000000000902', 'ics-other@example.com'),
    ('00000000-0000-0000-0000-000000000903', 'ics-admin@example.com');

INSERT INTO public.admin_users (user_id, email)
VALUES (
    '00000000-0000-0000-0000-000000000903',
    'ics-admin@example.com'
);

INSERT INTO public.ics_feed_tokens (id, user_id, token, label, project_filter, revoked_at)
VALUES
    (
        '11111111-1111-1111-1111-111111111901',
        '00000000-0000-0000-0000-000000000901',
        '1111111111111111111111111111111111111111111111111111111111111111',
        'Owner active',
        NULL,
        NULL
    ),
    (
        '11111111-1111-1111-1111-111111111902',
        '00000000-0000-0000-0000-000000000902',
        '2222222222222222222222222222222222222222222222222222222222222222',
        'Other active',
        NULL,
        NULL
    ),
    (
        '11111111-1111-1111-1111-111111111903',
        '00000000-0000-0000-0000-000000000901',
        '3333333333333333333333333333333333333333333333333333333333333333',
        'Owner revoked',
        NULL,
        now()
    );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901"}', true);

SELECT is(
    (SELECT count(*) FROM public.ics_feed_tokens),
    2::bigint,
    'users can list only their own active and revoked ICS tokens'
);

SELECT throws_like(
    $$ INSERT INTO public.ics_feed_tokens (user_id, token)
       VALUES (
           '00000000-0000-0000-0000-000000000902',
           '4444444444444444444444444444444444444444444444444444444444444444'
       ) $$,
    '%row-level security%',
    'users cannot create ICS feed tokens for another account'
);

SELECT lives_ok(
    $$ INSERT INTO public.ics_feed_tokens (id, user_id, token, label)
       VALUES (
           '11111111-1111-1111-1111-111111111904',
           '00000000-0000-0000-0000-000000000901',
           '5555555555555555555555555555555555555555555555555555555555555555',
           'Owner new token'
       ) $$,
    'users can create an ICS feed token for themselves'
);

SELECT lives_ok(
    $$ UPDATE public.ics_feed_tokens
       SET revoked_at = now()
       WHERE id = '11111111-1111-1111-1111-111111111901' $$,
    'users can revoke their own active ICS feed token'
);

SELECT isnt(
    (SELECT revoked_at FROM public.ics_feed_tokens WHERE id = '11111111-1111-1111-1111-111111111901')::text,
    NULL::text,
    'own ICS token revocation persists'
);

SELECT throws_like(
    $$ UPDATE public.ics_feed_tokens
       SET revoked_at = NULL
       WHERE id = '11111111-1111-1111-1111-111111111901' $$,
    '%revoked ICS feed tokens cannot be reactivated%',
    'users cannot reactivate a revoked ICS feed token'
);

SELECT throws_like(
    $$ UPDATE public.ics_feed_tokens
       SET token = '6666666666666666666666666666666666666666666666666666666666666666'
       WHERE id = '11111111-1111-1111-1111-111111111904' $$,
    '%immutable except user revocation%',
    'users cannot rotate an existing token row in place'
);

SELECT throws_like(
    $$ UPDATE public.ics_feed_tokens
       SET project_filter = ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid]
       WHERE id = '11111111-1111-1111-1111-111111111904' $$,
    '%immutable except user revocation%',
    'users cannot retarget an existing feed token'
);

SELECT lives_ok(
    $$ UPDATE public.ics_feed_tokens
       SET revoked_at = now()
       WHERE id = '11111111-1111-1111-1111-111111111902' $$,
    'cross-user revoke attempt is filtered by RLS'
);

RESET ROLE;

SELECT is(
    (SELECT revoked_at FROM public.ics_feed_tokens WHERE id = '11111111-1111-1111-1111-111111111902')::text,
    NULL::text,
    'users cannot revoke another user''s ICS token'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000901', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000901"}', true);

SELECT lives_ok(
    $$ DELETE FROM public.ics_feed_tokens
       WHERE id = '11111111-1111-1111-1111-111111111904' $$,
    'own hard-delete attempt is filtered by RLS'
);

SELECT is(
    (SELECT count(*) FROM public.ics_feed_tokens WHERE id = '11111111-1111-1111-1111-111111111904'),
    1::bigint,
    'users cannot hard-delete their own ICS token audit rows'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000903', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000903"}', true);

SELECT lives_ok(
    $$ DELETE FROM public.ics_feed_tokens
       WHERE id = '11111111-1111-1111-1111-111111111904' $$,
    'admins can hard-delete ICS token rows for operational cleanup'
);

SELECT * FROM finish();
ROLLBACK;
