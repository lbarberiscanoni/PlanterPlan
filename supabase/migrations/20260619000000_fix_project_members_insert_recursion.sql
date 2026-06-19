-- Fix "infinite recursion detected in policy for relation project_members".
--
-- The previous members_insert_policy WITH CHECK contained an inline subquery
-- over project_members itself:
--
--     project_id IN (SELECT pm.project_id FROM project_members pm
--                    WHERE pm.user_id = ... AND pm.role = 'owner')
--
-- A policy on project_members that selects from project_members re-applies the
-- same RLS, which Postgres rejects as infinite recursion. The branch was also
-- dead: 'owner' was removed in the 2026-05-15 role-hierarchy collapse
-- (roles are now planter / team / admin only).
--
-- Replace the self-referencing subquery with the existing SECURITY DEFINER
-- helpers (which bypass RLS and therefore cannot recurse):
--   * check_project_creatorship  — bootstraps the first membership row at
--                                   project/template creation (tasks.creator).
--   * check_project_ownership_by_role — lets a Planter add further members.
--   * is_admin — global admin override.

DROP POLICY IF EXISTS members_insert_policy ON public.project_members;

CREATE POLICY members_insert_policy ON public.project_members
    FOR INSERT
    WITH CHECK (
        public.check_project_creatorship(project_id, (SELECT auth.uid()))
        OR public.check_project_ownership_by_role(project_id, (SELECT auth.uid()))
        OR public.is_admin((SELECT auth.uid()))
    );
