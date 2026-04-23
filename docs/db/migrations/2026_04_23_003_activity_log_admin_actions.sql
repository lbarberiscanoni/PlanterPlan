-- Extend `activity_log` to accept cross-project admin moderation events.
--
-- Wave 27's activity_log was designed around project-scoped writes:
--   - `project_id` is NOT NULL (every row belongs to a project)
--   - `action` is a tight CHECK whitelist of project-scoped verbs
--
-- PR #178 (toggle-admin) and PR #179 (suspend / unsuspend / reset-password)
-- need to log cross-project admin actions. Those fit activity_log
-- semantically (append-only audit trail joined to actor) but violate
-- both constraints:
--
--   - `project_id` has no meaningful value for a cross-project admin
--     action (granting admin role isn't scoped to a project)
--   - Action verbs like `admin_granted` / `user_suspended` aren't on
--     the whitelist
--
-- Fix:
--   1. Drop NOT NULL on `project_id` so NULL means "platform-level
--      action, not project-scoped." SELECT policies still work (admin
--      sees everything, member sees is_active_member(project_id)=true
--      which evaluates to false on NULL, so non-admins can't read
--      cross-project rows — correct behavior).
--   2. Swap the CHECK whitelist for a superset that includes the five
--      new admin-moderation verbs.
--
-- Idempotency: DROP CONSTRAINT uses IF EXISTS; ALTER COLUMN DROP NOT
-- NULL is a no-op on an already-nullable column.

ALTER TABLE public.activity_log ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_action_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_action_check
    CHECK (action IN (
        -- Wave 27 — project-scoped verbs.
        'created','updated','deleted','status_changed',
        'member_added','member_removed','member_role_changed',
        'comment_posted','comment_edited','comment_deleted',
        -- Wave 32 — task-completion event (used by admin_user_detail's
        -- completed-30d count). Added post-hoc if missing; no-op if
        -- already present.
        'task_completed',
        -- PR #178 — platform-admin role toggle.
        'admin_granted','admin_revoked',
        -- PR #179 — user moderation.
        'user_suspended','user_unsuspended','password_reset_requested'
    ));

COMMENT ON COLUMN public.activity_log.project_id IS
'NULL for cross-project / platform-level admin actions (admin role toggle, user moderation). Otherwise references the project the row belongs to.';
