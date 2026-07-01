-- "Delete the part" pass over Supabase functions (2026-07-01 audit round 2).
-- Each function below is referenced by NOTHING: no RLS policy, no other function
-- body, no client `.rpc()` call, and no edge function. Verified via pg_policy +
-- pg_proc.prosrc scans and a full repo grep (src/ + supabase/functions/).
--
--   check_project_ownership   — legacy shim; the 4 project_members policies it
--                               once backed now call check_project_ownership_by_role.
--   invite_user_to_project    — superseded by the invite-by-email edge function
--                               (which does the inserts directly); never called.
--   get_invite_details        — no accept-invite path references it.
--   rag_get_project_context   — RAG was never wired up; there are zero vector
--                               columns in the schema and no caller.
--
-- Plain DROP (no CASCADE): if anything still depended on these the migration
-- would fail loudly rather than silently cascade.

DROP FUNCTION IF EXISTS public.check_project_ownership(uuid, uuid);
DROP FUNCTION IF EXISTS public.invite_user_to_project(uuid, text, text);
DROP FUNCTION IF EXISTS public.get_invite_details(uuid);
DROP FUNCTION IF EXISTS public.rag_get_project_context(uuid, integer);
