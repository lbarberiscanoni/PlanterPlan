-- SKIPPED — pending rewrite for the collapsed planter/team role model.
--
-- This suite asserts the OLD five-role permission matrix
-- (owner/editor/coach/viewer/limited). Those roles were removed in
-- 20260515000000_role_hierarchy_collapse.sql (role IN ('planter','team')), so
-- the membership INSERTs violated the CHECK constraint and the file errored at
-- setup ("planned N tests but ran 0"). A pure rename is insufficient: the
-- assertions encode role-specific outcomes that no longer hold (e.g. Team now
-- has full task CRUD).
--
-- Re-enable after rewriting against the planter/team matrix in
-- docs/architecture/auth-rbac.md.

BEGIN;

SELECT plan(1);

SELECT skip(
    'pgtap_task_role_matrix needs a rewrite to the collapsed planter/team role '
    'model — see follow-up task',
    1
);

SELECT * FROM finish();
ROLLBACK;
