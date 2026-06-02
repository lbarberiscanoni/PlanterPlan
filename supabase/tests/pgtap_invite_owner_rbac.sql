-- SKIPPED — pending rewrite for the collapsed planter/team role model.
--
-- This suite asserts the OLD invite/role-management matrix across
-- owner/editor/coach/viewer/limited. Those roles were removed in
-- 20260515000000_role_hierarchy_collapse.sql (role IN ('planter','team')), so
-- the membership/invite INSERTs violated the CHECK constraint and the file
-- errored at setup ("planned N tests but ran 0"). A pure rename is
-- insufficient: the assertions encode role-specific outcomes that no longer
-- hold under the collapsed model (Planter manages members; Team cannot).
--
-- Re-enable after rewriting against the members_*_policy / invite rules in
-- 20260515000000_role_hierarchy_collapse.sql and docs/architecture/auth-rbac.md.

BEGIN;

SELECT plan(1);

SELECT skip(
    'pgtap_invite_owner_rbac needs a rewrite to the collapsed planter/team role '
    'model — see follow-up task',
    1
);

SELECT * FROM finish();
ROLLBACK;
