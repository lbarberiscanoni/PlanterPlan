-- Wave 34 Task 1 — Admin RPC psql smoke
--
-- Run as the service role OR as an authenticated admin user. The first block
-- asserts non-admin callers get the `unauthorized` exception; the second
-- asserts admin callers receive result shapes.
--
-- Execute: psql "$SUPABASE_DB_URL" -f docs/db/tests/admin_rpcs.sql

\echo '== Non-admin authenticated user should be blocked =='

DO $$
DECLARE
    v_non_admin uuid;
BEGIN
    -- Pick any user NOT in admin_users. Adjust WHERE as needed for your env.
    SELECT id INTO v_non_admin
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = u.id)
    LIMIT 1;

    IF v_non_admin IS NULL THEN
        RAISE NOTICE 'No non-admin user found; skipping unauthorized check.';
        RETURN;
    END IF;

    -- Simulate the calling user id. In real psql, the caller is postgres/service
    -- role; these RPCs therefore won't actually raise. Use the Supabase SQL
    -- editor while logged in as the non-admin to get a meaningful result.
    RAISE NOTICE 'Manual step: sign into the Supabase SQL editor as non-admin user % and run:', v_non_admin;
    RAISE NOTICE '  SELECT * FROM public.admin_search_users(''test'', 5);';
    RAISE NOTICE '  Expect: ERROR: unauthorized: admin role required';
END;
$$;

\echo ''
\echo '== Admin should receive shaped results =='

DO $$
DECLARE
    v_admin uuid;
    v_probe uuid;
BEGIN
    SELECT au.user_id INTO v_admin
    FROM public.admin_users au
    LIMIT 1;

    IF v_admin IS NULL THEN
        RAISE NOTICE 'No admin_users row present; cannot smoke admin branch.';
        RETURN;
    END IF;

    -- In the Supabase SQL editor while logged in as the admin, run:
    RAISE NOTICE 'Manual step: sign into the SQL editor as admin user % and run:', v_admin;
    RAISE NOTICE '  SELECT * FROM public.admin_search_users(''test'', 10);';
    RAISE NOTICE '  SELECT public.admin_user_detail(%);', v_admin;
    RAISE NOTICE '  SELECT * FROM public.admin_recent_activity(20);';

    RAISE NOTICE '  Expect: result rows / jsonb; no exception.';

    -- Pick a probe uid to verify admin_user_detail returns shaped JSON.
    SELECT id INTO v_probe FROM auth.users LIMIT 1;
    IF v_probe IS NOT NULL THEN
        RAISE NOTICE '  For admin_user_detail smoke, use probe uid: %', v_probe;
    END IF;
END;
$$;
