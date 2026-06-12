-- Authz helper de-duplication (Step 3 / sub-step 1: collapse the helper sprawl).
--
-- After the 5->2 role collapse (20260515000000_role_hierarchy_collapse.sql) the
-- per-project membership predicate is expressible entirely through the single
-- primitive `has_project_role(pid, uid, roles[])`. Two helpers still carry their
-- own hand-rolled EXISTS query against project_members:
--
--   * check_project_ownership_by_role(p,u)  =  EXISTS(... role = 'planter')
--   * is_active_member(p,u)                 =  EXISTS(... any role)
--
-- This migration routes both through has_project_role so there is ONE source of
-- truth for "is this user a member with role X". It is behavior-preserving by
-- construction and touches NO call sites and NO policies:
--
--   check_project_ownership_by_role(p,u)
--       ==> has_project_role(p,u,'{planter}')
--           has_project_role = EXISTS(role = ANY('{planter}')) = EXISTS(role='planter').  IDENTICAL.
--
--   is_active_member(p,u)
--       ==> has_project_role(p,u,'{planter,team}')
--           The project_members_role_check CHECK constraint restricts role to
--           ('planter','team'), so EXISTS(role IN ('planter','team')) == EXISTS(any row).  IDENTICAL.
--
-- DELIBERATELY NOT DONE HERE (requires the pgTAP RLS suites to run, which needs a
-- live Postgres): deleting the wrapper functions and inlining `is_admin(uid) OR
-- has_project_role(...)` at the ~8 policy / 3 function call sites, and trimming the
-- dead role-ladder + 'owner' alias branch out of has_permission(). That is the
-- function-count reduction; it rewrites the authorization boundary and must not
-- land unverified. See supabase/tests/pgtap_rls.sql, pgtap_comment_author_mentions.sql,
-- pgtap_team_member_profiles.sql, pgtap_task_role_matrix.sql.
--
-- CREATE OR REPLACE preserves the existing owner, GRANTs and REVOKEs on both
-- functions, so no privilege re-grants are needed.

CREATE OR REPLACE FUNCTION public.check_project_ownership_by_role(p_id uuid, u_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Planter is the per-project top role after the 5->2 role collapse.
    RETURN public.has_project_role(p_id, u_id, ARRAY['planter']::text[]);
END;
$$;

COMMENT ON FUNCTION public.check_project_ownership_by_role(uuid, uuid) IS
    'Returns true when the user is a Planter on the project. Delegates to has_project_role (single membership-predicate source of truth).';

CREATE OR REPLACE FUNCTION public.is_active_member(p_project_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Any project member (planter or team). The role CHECK constraint guarantees
    -- these are the only possible role values, so this equals "has any membership row".
    RETURN public.has_project_role(p_project_id, p_user_id, ARRAY['planter', 'team']::text[]);
END;
$$;

COMMENT ON FUNCTION public.is_active_member(uuid, uuid) IS
    'Returns true when the user is any member (planter or team) of the project. Delegates to has_project_role (single membership-predicate source of truth).';
