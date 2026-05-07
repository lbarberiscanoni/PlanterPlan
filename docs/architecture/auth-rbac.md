# docs/architecture/auth-rbac.md

## Domain Overview
The Auth & RBAC system manages application-level authentication, user account lifecycles, and access control. It relies on Supabase for core identity management and utilizes a multi-tiered permission model separating Global App roles from contextual Project-Level roles.

## Core Entities & Data Models
* **App User:** The foundational identity object managed via Supabase Auth.
* **Global Roles:**
  * **Admin:** System-wide administrator. Manages Templates, Master Library, Resource Library, Analytics Dashboard, User Licenses, and Discount Codes.
  * **User:** Standard application user. Can sign up, create projects (subject to licensing), and join projects.
* **Project Roles:** Contextual permissions applied per project instance (`Owner`, `Editor`, `Viewer`, `Coach`).

## State Machines / Lifecycles
### Authentication Lifecycle
1. **Unauthenticated:** User inputs credentials on signup/login.
2. **Pending Confirmation:** System sends a confirmation email. User verifies via Supabase secure link.
3. **Authenticated:** User receives session token and gains access to the application via `AuthContext`.
4. **Error Handling:** Standardized generic error messages for invalid credentials to prevent enumeration.

## Business Rules & Constraints
* **Project Role Permission Matrix:**

| Permission / Action | Owner | Editor | Viewer (Limited) | Coach |
| :--- | :--- | :--- | :--- | :--- |
| **View all tasks/hierarchy** | Yes | Yes | Yes | Yes |
| **Edit task text info/fields**| Yes | Yes | Yes (If Assigned Lead) | No |
| **Update task status** | Yes | Yes | Yes (If Assigned Lead) | Yes (Coaching Tasks Only)|
| **Add tasks / subtasks** | Yes | Yes | Yes (If Assigned Lead) | No |
| **Delete tasks / subtasks** | Yes | Yes | No | No |
| **Assign Lead to task** | Yes | No | No | No |
| **Drag & Drop (Mutate)** | Yes | Yes | No | No |
| **Invite / Manage Users** | Yes | No | No | No |
| **Edit project settings** | Yes | No | No | No |

> **Footnote (Wave 29):** Viewer/Limited users may also edit tasks **under** any phase or milestone they are designated as Phase Lead for (not the phase/milestone row itself — assignment stays owner-only). See "Phase Lead" section below.

### Creatorship vs. Ownership (resolved Wave 24)

Historically `public.check_project_ownership(pid, uid)` was used as the
"is this user allowed to act on a project"-gate in RLS policies on
`public.project_members`. The function actually checked `tasks.creator =
uid` — whether the user was the original *creator* — **not** whether
they currently held the `owner` role. A creator who was later removed
from `project_members` still passed the check, which was the latent auth
bug called out in `docs/dev-notes.md`.

**Wave 23 (audit only):** split the concepts at the name level. Added
`public.check_project_creatorship(pid, uid)` carrying the original body;
rewrote `check_project_ownership` to a SQL shim delegating to it so the
four policies on `project_members` kept evaluating byte-for-byte
identically. Per-policy intent captured as inline comments.

**Wave 24 (behavior change — closes the leak):** rewrote each policy per
the audited intent, introduced `public.check_project_ownership_by_role(pid,
uid)` (STABLE, SECURITY DEFINER) for genuine ownership checks against
`project_members.role = 'owner'`, and **dropped the
`check_project_ownership` shim**. A former creator who is no longer in
`project_members` no longer passes the DELETE / UPDATE gates.

| Policy | Op | Final state (Wave 24) |
| --- | --- | --- |
| `members_delete_policy` | DELETE | `user_id = auth.uid()` OR `check_project_ownership_by_role(project_id, auth.uid())`. |
| `members_insert_policy` | INSERT | `check_project_creatorship(project_id, auth.uid())` (bootstrap) OR `project_id ∈ (SELECT … WHERE user_id = auth.uid() AND role = 'owner')` (already an owner). |
| `members_select_policy` | SELECT | `user_id = auth.uid()` OR `is_active_member(project_id, auth.uid())`. Creatorship branch removed. |
| `members_update_policy` | UPDATE | `check_project_ownership_by_role(project_id, auth.uid())`; `WITH CHECK` still blocks self-demotion to `viewer`. |

Migration: `docs/db/migrations/2026_04_18_rewrite_project_members_policies.sql`.

## Integration Points
* **Supabase Client:** Handles session persistence and edge-function authentication tokens.
* **Team Management:** Feeds contextual role data into the UI (e.g., `RoleIndicator.tsx`) to conditionally render administrative components.

## Known Gaps / Technical Debt
* **Licensing Enforcement:** Logic mapping Stripe subscription states to project creation limits requires further hardening.

## Resolved

* **Coach Role Tagging (Wave 22, hardened PR 3):** Resolved. Tasks intended for coach progress updates are flagged via `settings -> 'is_coaching_task' = true`. PR F moved authoring to template forms only; project instance forms hide the toggle and strip hidden flag values before submit. TaskDetailsView surfaces a read-only "Coaching" badge on tagged instances. The RLS UPDATE policy `"Enable update for coaches on coaching tasks"` scopes coach rows to non-template Coaching tasks and includes a matching `WITH CHECK`; `trg_enforce_coach_task_update_scope` then restricts coach writes to progress/status fields only. Coaches cannot edit text/content, settings, assignee, priority, hierarchy, origin/template metadata, resources, or delete tasks. Owner/editor/admin UPDATE behavior is unchanged.

* **Comments (Wave 26):** SELECT inherits project membership; INSERT requires `author_id = auth.uid()`; UPDATE restricted to authors on undeleted rows; DELETE allowed for authors, project owners (`check_project_ownership_by_role`), or admins. Full policy text in `docs/architecture/tasks-subtasks.md`.

* **Activity Log (Wave 27):** SELECT inherits project membership; INSERT/UPDATE/DELETE denied at policy level — only SECURITY DEFINER trigger functions write rows.

### Phase Lead (Wave 29)

A project Owner may designate any `viewer` or `limited`-role member as the **Lead** of a specific phase or milestone via `settings.phase_lead_user_ids` (a JSONB array on the phase/milestone row). The list allows multiple leads per phase; a single user can lead multiple phases.

**RLS** (migration `docs/db/migrations/2026_04_18_phase_lead_rls.sql`):
* Helper: `user_is_phase_lead(target_task_id uuid, uid uuid)` walks up the `parent_task_id` chain **starting at the parent** (the row itself is never matched) and returns true if any ancestor's `settings.phase_lead_user_ids` contains `uid`. Self-exclusion is load-bearing: a Phase Lead can edit tasks UNDER a phase but cannot edit the phase row itself.
* Policy: `"Enable update for phase leads"` on `public.tasks` — `USING (origin = 'instance' AND user_is_phase_lead(id, auth.uid()))` with a matching `WITH CHECK`.
* **Additive only** — owner/editor UPDATE policies are unchanged. Coach progress-only scope is enforced separately by `trg_enforce_coach_task_update_scope`. SELECT for viewers is unchanged (already project-wide).

**UI** (`src/features/tasks/components/TaskFormFields.tsx`): the `<PhaseLeadPicker>` sub-component (multi-select popover) renders only for `membershipRole === 'owner'` on phase/milestone rows. Options come from `useTeam(projectId).teamMembers.filter(m => m.role === 'viewer' || m.role === 'limited')` — owners/editors/admins already have task edit privileges, while coaches are governed by the separate Coaching-task progress scope. Badge in `TaskDetailsView.tsx` lists current leads.

**Permission matrix update**: limited viewers may now edit tasks under any phase/milestone they are designated as Phase Lead for. See the matrix footnote above.

### Notification Preferences (Wave 30)

Per-user `public.notification_preferences` row, bootstrapped by `trg_bootstrap_notification_prefs` AFTER INSERT on `auth.users`. Append-only `public.notification_log` audit trail captures every dispatch attempt (sent or skipped) for debugging, idempotency, and the user-visible "Recent notifications" section in Settings.

**RLS**:
* `notification_preferences`: SELECT/INSERT/UPDATE for `user_id = auth.uid()`. DELETE not exposed — UPDATE is the off-switch.
* `notification_log`: SELECT for `user_id = auth.uid() OR is_admin(auth.uid())`. INSERT/UPDATE/DELETE denied at policy level — only SECURITY DEFINER dispatch functions (Task 2 + Task 3) write rows.

**Quiet hours**: stored as `TIME` in the user-supplied `timezone` column. Tasks 2 + 3 dispatch functions are responsible for skipping + logging when local-now is within the quiet window.

Migration: `docs/db/migrations/2026_04_18_notification_preferences.sql`.
## Admin RPCs And Moderation (Wave 34, Verified PR 8)

SECURITY DEFINER RPCs back the `/admin/*` read surface and the platform-admin role toggle. Every admin read RPC shares the same auth-gate pattern (see `docs/db/migrations/2026_04_18_admin_rpcs.sql`):

```sql
IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin role required';
END IF;
```

Non-admin callers never get an empty result set — they get the loud exception. This makes authorization failures visible in logs + Sentry rather than silently degrading.

| RPC | Returns | Migration |
| :--- | :--- | :--- |
| `admin_search_users(query, limit)` | `TABLE (id, email, display_name, last_sign_in_at, project_count)` | `2026_04_18_admin_rpcs.sql` |
| `admin_user_detail(uid)` | `jsonb` (profile + project memberships + task counts) | `2026_04_18_admin_rpcs.sql` |
| `admin_recent_activity(limit)` | `TABLE (…, actor_email)` | `2026_04_18_admin_rpcs.sql` |
| `admin_list_users(filter jsonb, limit, offset)` | `TABLE (…, is_admin, active_project_count, completed_tasks_30d, overdue_task_count)` | `2026_04_18_admin_list_users_rpc.sql` |
| `admin_analytics_snapshot()` | `jsonb` (totals + time series + breakdowns + top-10 lists) | `2026_04_18_admin_analytics_rpc.sql` |
| `admin_set_user_admin_role(target_uid, make_admin)` | `void`; writes `admin_users` + `activity_log`; self-demotion forbidden | `2026_04_23_001_admin_set_user_admin_role.sql` |

Each RPC has `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` so the call surface is restricted to signed-in users, with the function body enforcing admin-only access.

Client wrappers live under `planter.admin.*` in `src/shared/api/planterClient.ts`. The `useIsAdmin` hook (`src/features/admin/hooks/useIsAdmin.ts`) reads the already-hydrated `user.role === 'admin'` assignment from AuthContext — no extra round-trip per render.

Admin suspension, unsuspension, and password-reset link generation cannot be implemented as SQL RPCs because they call Supabase Auth admin APIs. Those actions route through `supabase/functions/admin-user-moderation/`:

* The function first authenticates the caller with the submitted user JWT.
* It checks `public.is_admin(caller.id)` before any target user lookup.
* Only after that check passes does it use the service-role client for `auth.admin.updateUserById` or `auth.admin.generateLink`.
* Self-suspend/self-unsuspend are rejected; reset-password on self is allowed.
* `activity_log` records `user_suspended`, `user_unsuspended`, or `password_reset_requested`, but reset links are never written to logs.
