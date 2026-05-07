BEGIN;

SELECT plan(12);

TRUNCATE TABLE
    public.activity_log,
    public.admin_users,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'team-owner@example.com',
    'team-editor@example.com',
    'team-viewer@example.com',
    'team-outsider@example.com',
    'team-admin@example.com'
);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
    (
        '00000000-0000-0000-0000-000000002101',
        'team-owner@example.com',
        '{"full_name":"Owner Person","avatar_url":"https://img.example.com/owner.png"}'::jsonb
    ),
    (
        '00000000-0000-0000-0000-000000002102',
        'team-editor@example.com',
        '{"first_name":"Ed","last_name":"Itor"}'::jsonb
    ),
    (
        '00000000-0000-0000-0000-000000002103',
        'team-viewer@example.com',
        '{"name":"Viewer Name"}'::jsonb
    ),
    (
        '00000000-0000-0000-0000-000000002104',
        'team-outsider@example.com',
        '{}'::jsonb
    ),
    (
        '00000000-0000-0000-0000-000000002105',
        'team-admin@example.com',
        '{}'::jsonb
    );

INSERT INTO public.admin_users (user_id, email)
VALUES ('00000000-0000-0000-0000-000000002105', 'team-admin@example.com');

INSERT INTO public.tasks (id, title, status, creator, root_id, origin)
VALUES (
    '11111111-1111-1111-1111-111111112101',
    'Team Profile Project',
    'not_started',
    '00000000-0000-0000-0000-000000002101',
    '11111111-1111-1111-1111-111111112101',
    'instance'
);

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111112101', '00000000-0000-0000-0000-000000002101', 'owner'),
    ('11111111-1111-1111-1111-111111112101', '00000000-0000-0000-0000-000000002102', 'editor'),
    ('11111111-1111-1111-1111-111111112101', '00000000-0000-0000-0000-000000002103', 'viewer');

SELECT ok(
    has_function_privilege('authenticated', 'public.list_project_members_with_profiles(uuid)', 'EXECUTE'),
    'authenticated users can execute the team profile hydration RPC'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002101"}', true);

SELECT is(
    (SELECT count(*) FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')),
    3::bigint,
    'project owners can read the hydrated team roster'
);

SELECT is(
    (
        SELECT first_name
        FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')
        WHERE user_id = '00000000-0000-0000-0000-000000002102'
    ),
    'Ed',
    'explicit first_name metadata is returned'
);

SELECT is(
    (
        SELECT last_name
        FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')
        WHERE user_id = '00000000-0000-0000-0000-000000002102'
    ),
    'Itor',
    'explicit last_name metadata is returned'
);

SELECT is(
    (
        SELECT display_name
        FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')
        WHERE user_id = '00000000-0000-0000-0000-000000002103'
    ),
    'Viewer Name',
    'name metadata hydrates display_name'
);

SELECT is(
    (
        SELECT avatar_url
        FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')
        WHERE user_id = '00000000-0000-0000-0000-000000002101'
    ),
    'https://img.example.com/owner.png',
    'avatar_url metadata is returned for roster display'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002104"}', true);

SELECT throws_like(
    $$ SELECT public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101') $$,
    '%unauthorized: project membership required%',
    'non-members cannot use the RPC to hydrate project member profiles'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002105', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002105"}', true);

SELECT is(
    (SELECT count(*) FROM public.list_project_members_with_profiles('11111111-1111-1111-1111-111111112101')),
    3::bigint,
    'global admins can read hydrated team rosters'
);

SELECT lives_ok(
    $$ DELETE FROM public.project_members
       WHERE project_id = '11111111-1111-1111-1111-111111112101'
         AND user_id = '00000000-0000-0000-0000-000000002103' $$,
    'global admins can remove project members through RLS'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.project_members
        WHERE user_id = '00000000-0000-0000-0000-000000002103'
    ),
    0::bigint,
    'admin remove action deletes the target membership'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000002102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000002102"}', true);

SELECT lives_ok(
    $$ DELETE FROM public.project_members
       WHERE project_id = '11111111-1111-1111-1111-111111112101'
         AND user_id = '00000000-0000-0000-0000-000000002101' $$,
    'editor remove attempts are filtered by RLS'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.project_members
        WHERE user_id = '00000000-0000-0000-0000-000000002101'
    ),
    1::bigint,
    'editor remove attempts do not remove owner memberships'
);

SELECT * FROM finish();
ROLLBACK;
