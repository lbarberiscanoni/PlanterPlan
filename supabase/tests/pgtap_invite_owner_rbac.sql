BEGIN;

SELECT plan(25);

TRUNCATE TABLE
    public.activity_log,
    public.admin_users,
    public.project_invites,
    public.project_members,
    public.tasks
CASCADE;

DELETE FROM auth.users
WHERE email IN (
    'invite-owner@example.com',
    'invite-editor@example.com',
    'invite-viewer@example.com',
    'invite-admin@example.com',
    'invite-existing@example.com',
    'invite-admin-target@example.com',
    'invite-managed@example.com',
    'invite-direct-target@example.com'
);

INSERT INTO auth.users (id, email) VALUES
    ('00000000-0000-0000-0000-000000001101', 'invite-owner@example.com'),
    ('00000000-0000-0000-0000-000000001102', 'invite-editor@example.com'),
    ('00000000-0000-0000-0000-000000001103', 'invite-viewer@example.com'),
    ('00000000-0000-0000-0000-000000001104', 'invite-admin@example.com'),
    ('00000000-0000-0000-0000-000000001105', 'invite-existing@example.com'),
    ('00000000-0000-0000-0000-000000001106', 'invite-admin-target@example.com'),
    ('00000000-0000-0000-0000-000000001107', 'invite-managed@example.com'),
    ('00000000-0000-0000-0000-000000001108', 'invite-direct-target@example.com');

INSERT INTO public.admin_users (user_id, email)
VALUES ('00000000-0000-0000-0000-000000001104', 'invite-admin@example.com');

INSERT INTO public.tasks (id, title, status, creator, root_id, origin)
VALUES (
    '11111111-1111-1111-1111-111111111101',
    'Invite RBAC Project',
    'not_started',
    '00000000-0000-0000-0000-000000001101',
    '11111111-1111-1111-1111-111111111101',
    'instance'
);

INSERT INTO public.project_members (project_id, user_id, role) VALUES
    ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000001101', 'owner'),
    ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000001102', 'editor'),
    ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000001103', 'viewer'),
    ('11111111-1111-1111-1111-111111111101', '00000000-0000-0000-0000-000000001107', 'viewer');

SELECT is(
    public.get_user_id_by_email('INVITE-EXISTING@EXAMPLE.COM'),
    '00000000-0000-0000-0000-000000001105'::uuid,
    'existing-user lookup is case-insensitive'
);

SELECT ok(
    NOT has_function_privilege('authenticated', 'public.get_user_id_by_email(text)', 'EXECUTE'),
    'authenticated users cannot execute the email lookup helper directly'
);

SELECT ok(
    has_function_privilege('service_role', 'public.get_user_id_by_email(text)', 'EXECUTE'),
    'service role can execute the email lookup helper for invite delivery'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101"}', true);

SELECT lives_ok(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'INVITE-EXISTING@example.com',
        'viewer'
    ) $$,
    'owners can invite existing users through the RPC'
);

RESET ROLE;

SELECT is(
    (
        SELECT role
        FROM public.project_members
        WHERE project_id = '11111111-1111-1111-1111-111111111101'
          AND user_id = '00000000-0000-0000-0000-000000001105'
    ),
    'viewer',
    'owner RPC adds the existing user with the requested role'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101"}', true);

SELECT throws_like(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'not-an-email',
        'viewer'
    ) $$,
    '%Invalid email%',
    'invite RPC rejects malformed email addresses'
);

SELECT lives_ok(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'New-Pending@example.com',
        'coach'
    ) $$,
    'owners can create pending email invites through the RPC'
);

RESET ROLE;

SELECT is(
    (
        SELECT role
        FROM public.project_invites
        WHERE project_id = '11111111-1111-1111-1111-111111111101'
          AND email = 'new-pending@example.com'
    ),
    'coach',
    'owner RPC lowercases and stores pending invites'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102"}', true);

SELECT throws_like(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'invite-direct-target@example.com',
        'viewer'
    ) $$,
    '%only project owners can invite users%',
    'editors cannot invite users through the RPC'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001103', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001103"}', true);

SELECT throws_like(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'invite-direct-target@example.com',
        'viewer'
    ) $$,
    '%only project owners can invite users%',
    'viewers cannot invite users through the RPC'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102"}', true);

SELECT throws_like(
    $$ INSERT INTO public.project_invites (project_id, email, role)
       VALUES (
           '11111111-1111-1111-1111-111111111101',
           'editor-direct@example.com',
           'viewer'
       ) $$,
    '%row-level security%',
    'editors cannot create pending invites directly'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101"}', true);

SELECT lives_ok(
    $$ INSERT INTO public.project_invites (project_id, email, role)
       VALUES (
           '11111111-1111-1111-1111-111111111101',
           'owner-direct@example.com',
           'viewer'
       ) $$,
    'owners can create pending invites directly'
);

SELECT is(
    (
        SELECT count(*)
        FROM public.project_invites
        WHERE email = 'owner-direct@example.com'
    ),
    1::bigint,
    'owners can view pending project invites'
);

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102"}', true);

SELECT is(
    (
        SELECT count(*)
        FROM public.project_invites
        WHERE email = 'owner-direct@example.com'
    ),
    0::bigint,
    'editors cannot view pending project invites'
);

SELECT lives_ok(
    $$ DELETE FROM public.project_invites
       WHERE email = 'owner-direct@example.com' $$,
    'editor pending-invite delete attempts are filtered by RLS'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.project_invites
        WHERE email = 'owner-direct@example.com'
    ),
    1::bigint,
    'editor pending-invite delete attempts do not remove rows'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001101', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001101"}', true);

SELECT lives_ok(
    $$ DELETE FROM public.project_invites
       WHERE email = 'owner-direct@example.com' $$,
    'owners can delete pending invites'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.project_invites
        WHERE email = 'owner-direct@example.com'
    ),
    0::bigint,
    'owner pending-invite delete removes the row'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102"}', true);

SELECT lives_ok(
    $$ UPDATE public.project_members
       SET role = 'coach'
       WHERE project_id = '11111111-1111-1111-1111-111111111101'
         AND user_id = '00000000-0000-0000-0000-000000001107' $$,
    'editor member-role update attempts are filtered by RLS'
);

RESET ROLE;

SELECT is(
    (
        SELECT role
        FROM public.project_members
        WHERE project_id = '11111111-1111-1111-1111-111111111101'
          AND user_id = '00000000-0000-0000-0000-000000001107'
    ),
    'viewer',
    'editor member-role update attempts do not change the target role'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001102', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001102"}', true);

SELECT lives_ok(
    $$ DELETE FROM public.project_members
       WHERE project_id = '11111111-1111-1111-1111-111111111101'
         AND user_id = '00000000-0000-0000-0000-000000001107' $$,
    'editor member removal attempts are filtered by RLS'
);

RESET ROLE;

SELECT is(
    (
        SELECT count(*)
        FROM public.project_members
        WHERE project_id = '11111111-1111-1111-1111-111111111101'
          AND user_id = '00000000-0000-0000-0000-000000001107'
    ),
    1::bigint,
    'editor member removal attempts do not remove the target'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001104"}', true);

SELECT lives_ok(
    $$ SELECT public.invite_user_to_project(
        '11111111-1111-1111-1111-111111111101',
        'invite-admin-target@example.com',
        'limited'
    ) $$,
    'platform admins can invite existing users without project membership'
);

RESET ROLE;

SELECT is(
    (
        SELECT role
        FROM public.project_members
        WHERE project_id = '11111111-1111-1111-1111-111111111101'
          AND user_id = '00000000-0000-0000-0000-000000001106'
    ),
    'limited',
    'admin RPC adds the existing user with the requested role'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000001104', true);
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001104"}', true);

SELECT lives_ok(
    $$ INSERT INTO public.project_invites (project_id, email, role)
       VALUES (
           '11111111-1111-1111-1111-111111111101',
           'admin-direct@example.com',
           'viewer'
       ) $$,
    'platform admins can create pending invites without project membership'
);

SELECT * FROM finish();
ROLLBACK;
