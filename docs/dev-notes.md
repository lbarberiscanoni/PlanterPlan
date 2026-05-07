# Dev Notes

Technical debt and architectural notes for the team.

## Wave 36 — Template Hardening

### Resolved (Wave 36)

- **Template versioning** — `public.tasks.template_version int NOT NULL DEFAULT 1` (migration `docs/db/migrations/2026_04_18_template_versioning.sql`). BEFORE UPDATE trigger `trg_bump_template_version` increments on template-row text/structural edits. `Task.clone` looks up the source template's version after the RPC lands and stamps `settings.cloned_from_template_version` on the cloned root. Deliberate non-propagation (edits to the template do NOT update existing instances) — admins spot drift in `/admin/templates` via a "stale" badge when an instance's stamp is behind the current template version.
- **Template immutability** — `public.tasks.cloned_from_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL` (migration `docs/db/migrations/2026_04_18_task_template_origin.sql`). Stamped server-side by `clone_project_template` per cloned descendant. PR 2 hardens this below the UI with `trg_enforce_template_scaffold_immutability`: app-role deletes and structural/content/protected-template-settings updates fail for cloned instance scaffold rows; workflow-state updates and runtime project configuration such as supervisor report delivery remain allowed; postgres/service-role bypass is reserved for audited maintenance. `TaskDetailsView` now blocks all template-origin delete attempts, including owners. `TaskItem` renders an indigo "T" badge with a "From template" Radix tooltip (reusing the Wave 33 primitive).
- **Admin Templates surface at `/admin/templates`** — cross-tenant template list with Version column + right-side "cloned instances" drilldown showing each instance's stamped version vs the template's current version. New lazy-loaded route registered under the Wave 34 AdminLayout.

### Active (Wave 36 → future)

- **Server-side delete enforcement** — v1 ships an app-side guard only; a per-row RLS policy would be brittle and owner-bypass is clearer in app code. Revisit if abuse reports materialize.
- **UI to "update this project to the latest template version"** — deferred (would require a three-way merge).
- **Tracking edits to template-origin tasks** — closed by PR 2 for protected structural/content/template-provenance fields; broad reconciliation/sync from source templates remains deliberately out of scope.

## Wave 35 — External Integrations (ICS)

### Active (Wave 35)

- ICS feeds are **read-only**. Two-way sync (Google Calendar / Outlook write-back) is deferred with no wave assigned.
- Single-task `.ics` download is deferred (the Wave 35 baseline is feed-only).
- HMAC-signed URLs with server-enforced expiry are deferred — Wave 35's opaque-token model is the v1 baseline; rotation is the revocation story (soft-delete via `revoked_at`, new token generation per rotate).

### Resolved (Wave 35)

- **Per-user ICS calendar feeds** — `public.ics_feed_tokens` (migration `docs/db/migrations/2026_04_18_ics_tokens.sql`) + public edge function `supabase/functions/ics-feed/` returning `text/calendar` (RFC 5545). Tokens are 256-bit (`crypto.getRandomValues`, 32 bytes → 64 hex chars). 404 on revoked/unknown. Feed tasks are assigned to the token owner and still inside that owner’s current project memberships. `last_accessed_at` is awaited and stamped on every successful fetch. Settings → Integrations tab (`src/features/settings/components/IcsFeedsCard.tsx`) exposes create + copy + soft-revoke/rotate. SSoT: `docs/architecture/integrations.md`.

## Wave 34 — Advanced Admin Management

### Resolved (Wave 34)

- **`/admin` shell** — `src/pages/admin/AdminLayout.tsx` (lazy-loaded in `App.tsx`) hard-gates every `/admin/*` route via `useIsAdmin()`; non-admins get a Sonner toast and redirect to `/tasks`. Left-rail nav links to Home / Users / Analytics + shortcut links to Templates and Projects that route into the existing Project surfaces.
- **Global admin search** — `src/pages/admin/components/AdminSearch.tsx` debounces at 200ms (2-char min) and returns three parallel result groups (Users via `admin_search_users`, Projects + Templates via an in-memory filter of the task list). Click a row → canonical detail surface.
- **User-management table** — `src/pages/admin/AdminUsers.tsx` + `src/features/admin/hooks/useAdminUsers.ts`. Server-side filter via `admin_list_users(filter jsonb, limit, offset)`. Right-side detail aside populates via `useAdminUserDetail` (hits `admin_user_detail`). Deep-link via `/admin/users/:uid` (AdminSearch navigates here on user click).
- **Analytics dashboard** — `src/pages/admin/AdminAnalytics.tsx` + `src/features/admin/hooks/useAdminAnalytics.ts`. One RPC (`admin_analytics_snapshot`) backs every chart: totals cards, new-projects/week LineChart, project-kind PieChart, task-status BarChart, top-10 active users + popular templates. recharts already in the bundle — zero new deps.
- **Admin notifications on new project** — `trg_notify_admin_on_new_project` AFTER INSERT trigger (see `docs/db/migrations/2026_04_18_new_project_admin_notify.sql`). Enqueues one `notification_log` row per admin (excluding the creator) with `event_type = 'admin_new_project_pending'`. Downstream: Wave 30's `dispatch-notifications` cron delivers through each admin's email/push prefs + quiet hours. Closes the `dashboard-analytics.md` "Admin Notifications" known gap.
- **SECURITY DEFINER discipline** — every new RPC opens with `IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized: admin role required' END IF`. Loud on auth-fail, no silent empty-result degradation.
- **Admin user-management actions** — `/admin/users/:uid?` exposes platform-admin grant/revoke, suspend/unsuspend, and admin-generated password-reset links. Role changes use the `admin_set_user_admin_role` SECURITY DEFINER RPC; suspension and reset-password use `supabase/functions/admin-user-moderation/` with authorize-then-escalate flow, self-suspension/self-demotion guards, and `activity_log` audit rows. PR 8 adds mocked Edge Function coverage and a component-level error-state regression.

### Deferred (Wave 34 → future)

- **Bulk CSV export** of the user table — deferred, no wave assigned.
- **AdminAnalytics component-level test** — the hook layer carries the wiring coverage; recharts chart internals are the lib's responsibility.
- **E2E admin persona + `admin.json` auth state + `scripts/seed-e2e.js` extension** — out of scope for this single-branch megabatch; the unit + hook coverage is sufficient for review.

## Wave 33 — Unified Tasks View

### Resolved (Wave 33)

- **`/daily` merged into `/tasks`** — `src/pages/DailyTasks.tsx` deleted; `<Route path="daily">` now serves `<Navigate to="/tasks" replace />` so bookmarks redirect instead of 404. ProjectSidebar + CommandPalette point at `/tasks`. Orphaned `tasks.daily.*` i18n keys removed from en/es.
- **Due-date badges on task rows** — new `src/shared/lib/date-engine/formatTaskDueBadge.ts` helper returns `{label, kind, tone}` tuples (kind discriminator gives the renderer a hook to translate "Today"/"Tomorrow" via `tasks.dueBadge.*` keys; weekday + full-date forms stay date-fns-formatted for now — a future locale pass can swap to Intl). Render site is `TaskItem.tsx` with red/orange/neutral tones.
- **Due-date range filter** — `useTaskFilters.ts` grew a `dueDateRange` predicate that AND-combines with every status filter (inclusive bounds, open-ended on either side; tasks with null due_date drop when any bound is set). UI: two inline `<input type="date">` controls + a clear button on `TasksPage.tsx`.
- **Task-row click → `TaskDetailsPanel`** — `TasksPage` now mounts the same panel as `Project.tsx` when a row is clicked. The panel's full editor / presence / activity tree works on the Tasks page for free.
- **Project-name tooltip on task title** — new `src/shared/ui/tooltip.tsx` wraps `@radix-ui/react-tooltip`. App-shell mounts `<TooltipProvider delayDuration={300}>`. When `parentProjectTitle` is threaded into `TaskItem`, the title is wrapped in a tooltip trigger. Standalone template-root rows (no distinct parent project) fall back to the native `title` attribute and skip the portal.
- New dev dep `@testing-library/user-event@^14.6.1` for the hover-driven tooltip test.

## Wave 32 — UX Bug Fixes

### Resolved (Wave 32)

- **Tasks-page status filters** — the `milestones` predicate in `src/features/tasks/hooks/useTaskFilters.ts` now filters by `task_type === 'milestone'` (Wave 25 discriminator column) rather than the structural grandchild-of-root heuristic. Inert status filters fixed where the compared literal drifted from the Wave 23 canonical `'todo' | 'not_started' | 'in_progress' | 'completed'` set.
- **New Template entry point** — superseded by the PR C/PR D creation host:
  project/template creation now opens from `/tasks?action=new-project` and
  `/tasks?action=new-template`; `/dashboard` redirects to `/tasks`.

### Audit note — dropped Task

The Wave 32 plan originally scoped a third task: "project due date does not persist after save" (cache invalidation on `useProjectMutations`). Pre-flight discovered the fix already lived on `main` from Wave 15 (commit `c88b3e7`), with its regression test in `Testing/unit/features/projects/hooks/useProjectMutations.test.ts` (commit `30616d8`). Task dropped; wave shipped as two tasks rather than three.

## Localization

### Spanish translation is machine-translated

**Active (Wave 31).** `src/shared/i18n/locales/es.json` was produced by a machine-translation pass from `en.json` at commit `63c77d8`. The file's `_meta.review_required_before_marketing: true` flag is enforced by `Testing/unit/shared/i18n/es-json.test.ts`, reflected in `SUPPORTED_LOCALES`, and surfaced in the Settings locale switcher as beta/review-required. Quality is "good enough for an internal beta" but has not been reviewed by a native Spanish speaker. **Do not market "Spanish support" on the marketing site or app store listing until a human-review pass lands.** The pipeline itself (i18next + module augmentation + locale switcher + Intl formatters) is production-ready — future locales become a translator-only workflow per `docs/architecture/i18n.md` §"Adding a new locale."

### String-extraction completion

**Resolved (Wave 36 remediation).** The Wave 31 follow-up surfaces have now been extracted: the `TaskDetailsView` family and side panel labels, `AddPersonModal`, deep library views, activity-log humanizers, command palette/navigation copy, and admin/task surfaces touched by Waves 33-36 resolve through `react-i18next` keys. `Testing/unit/shared/i18n/es-json.test.ts` continues to enforce en/es key parity and interpolation marker parity.

The `eslint-plugin-i18next no-literal-string` rule remains outside product scope for this remediation because the current parity tests are the active guardrail and the repository still contains acceptable non-UI literals such as enum values, routes, SQL snippets, and test fixtures.

### React 18.3.1 pin (Wave 31 scope expansion)

**Active (Wave 31).** `package.json` pins `react`, `react-dom`, and `react-is` to exact `18.3.1`, with `@types/react`/`@types/react-dom` on `^18.3.x`. Originally intended to ship on React 19, but Vercel preview deploys were blocked by peer-dep and runtime incompatibilities under `--legacy-peer-deps`. Audit confirmed no React-19-only API usage (`use()`, `useActionState`, `useFormStatus`, server actions / `form action={fn}`, `ref` as a prop on function components, built-in `<title>`/`<meta>` in render trees). All UI primitives route refs via `React.forwardRef`; `main.tsx` uses `createRoot` from `react-dom/client`. `.npmrc` keeps `legacy-peer-deps=true` for `gantt-task-react@0.3.9` (peer: `react@^18`). `npm run verify-dependencies` now runs in CI and fails on React runtime unpinning, React 19 drift, or unsupported `@dnd-kit` major drift. Revisiting React 19 is not on the near-term roadmap.

## Database

### No type discriminator on `tasks`

**Resolved (Wave 25 + PR 4).** `public.tasks` now carries a `task_type text` column with a CHECK constraint (`'project' | 'phase' | 'milestone' | 'task' | 'subtask'`) and a supporting btree index. `public.derive_task_type(parent_task_id uuid)` returns the correct value by walking the parent chain and emits `subtask` for children of task-depth rows. The `trg_set_task_type` BEFORE INSERT OR UPDATE OF `parent_task_id` trigger keeps `NEW.task_type` in lockstep so writers never have to set the column manually. Existing rows were backfilled by the Wave 25 migration. PR 4 added `trg_enforce_task_hierarchy_depth`, which rejects children below subtasks and reparenting/cycle attempts that would exceed `project -> phase -> milestone -> task -> subtask`. Migrations: `docs/db/migrations/2026_04_18_task_type_discriminator.sql`, `supabase/migrations/20260506003000_task_hierarchy_depth_guard.sql`.

No existing query has been rewritten to consume `task_type` yet — this wave is additive only. Future perf passes can drop recursive tree walks in favour of `WHERE task_type = ...` as needed.

_Historical:_ the `tasks` table stored Projects, Phases, Milestones, and Tasks in a single table with no discriminator column. Queries like "all phases" or "all leaf tasks" required recursive `parent_task_id` walks.

```
Project  → parent_task_id = null, root_id = id
  Phase  → parent_task_id = project_id
    Milestone → parent_task_id = phase_id
      Task    → parent_task_id = milestone_id
```

### Dual completion signals

**Resolved (Wave 23).** `sync_task_completion_flags` BEFORE INSERT/UPDATE trigger on `public.tasks` now guarantees `is_complete === (status === 'completed')` at the DB layer. `check_phase_unlock()` (reads `is_complete`) and `handle_phase_completion()` (reads `status`) both see the synced row since the BEFORE trigger fires first. The app-layer mirror in `planterClient.updateStatus` is simplified: only `status` is sent on every server payload; the trigger derives `is_complete`. Migration: `docs/db/migrations/2026_04_17_sync_task_completion.sql`. Architecture note: `docs/architecture/tasks-subtasks.md` — Auto-Completion Automation.

_Historical:_ `is_complete` (boolean) and `status = 'completed'` (text) represented the same concept but were consumed by different triggers. If they drifted — e.g., raw SQL updated only one side — only one trigger fired and phase unlocking silently broke. The fix is belt-and-suspenders: the app layer no longer deliberately writes both; the DB trigger enforces the invariant regardless.

### `check_project_ownership` is a latent auth bug

**Resolved (Wave 24).** The leak is closed. Each of the four RLS policies on `public.project_members` has been rewritten per the Wave 23 audit:
* `members_insert_policy` → uses `check_project_creatorship` directly (bootstrap only).
* `members_select_policy` → creatorship branch dropped (redundant + was the actual leak).
* `members_delete_policy` / `members_update_policy` → use a new `check_project_ownership_by_role(pid, uid)` helper that queries `project_members.role = 'owner'`. A former creator who has been removed from `project_members` no longer passes.

The `check_project_ownership` shim has been dropped. Migration: `docs/db/migrations/2026_04_18_rewrite_project_members_policies.sql`. Audit table and final policy states: `docs/architecture/auth-rbac.md`.

_Historical (Wave 23 audit):_ `public.check_project_creatorship(pid, uid)` was introduced carrying the original body; `public.check_project_ownership` became a thin SQL shim delegating to it so the four policies could be rewritten in Wave 24 without a byte-for-byte semantic change window.

### Coach task update scope

**Resolved (PR 3).** The Wave 22 coach UPDATE policy is now paired with `trg_enforce_coach_task_update_scope`. Coaches retain project-wide read access, but writes are limited below the UI to `status`/completion progress on `settings.is_coaching_task = true` instance tasks. The trigger blocks coach-role changes to content, settings, assignment, priority, hierarchy, origin/template metadata, scheduling fields, and deletion remains denied by RLS. Owner/editor/admin and explicit service-role maintenance paths are unchanged. UI capability checks live in `src/features/tasks/lib/task-permissions.ts`.

### `task_comments.author:users(...)` PostgREST join is typed-client-hostile

**Resolved (PR 7).** Comment reads now go through
`public.list_task_comments_with_authors(p_task_id, p_comment_id)` instead of a
cross-schema PostgREST `author:users(...)` select. The SECURITY DEFINER RPC
checks project membership/admin status, joins `task_comments` to `auth.users`
internally, and returns an explicit JSON author DTO that `planterClient`
normalizes. Deleted/anonymized authors intentionally hydrate as `author: null`;
non-null `author_id` plus missing/malformed author DTOs are logged as
impossible hydration states.

Mention resolution no longer passes raw handles through on RPC failure. The
comment still posts, but `resolveMentions` warns and writes an empty mentions
array so notification misses are observable. `trg_enqueue_comment_mentions`
now logs invalid mention payloads and includes recipient, actor, comment, task,
and project identifiers in every `mention_pending` payload.

### Service worker JS exception (`public/sw.js`)

**Active. No wave assigned.** `public/sw.js` (Wave 30 Task 2 push handler) is the only non-TypeScript file in the application tree. The styleguide calls for TS-only across `src/`; the service worker carves out one documented exception because the TS → worker build path hasn't landed yet. The PWA / workbox track that would have subsumed this file was descoped during the post-Wave-31 roadmap renumber, so there is no active plan to subsume it — the exception stays documented until a future workbox (or equivalent) rewrite is scheduled.

Do not grow `sw.js` beyond lifecycle + push responsibilities. The current handler implements `install` / `activate` / `push` / `notificationclick`, intentionally omits `fetch`/cache handling to avoid stale cache poisoning, normalizes malformed push payloads, and sanitizes notification click targets to same-origin paths. Any additional SW responsibility (offline queue, asset precache) waits for the TS rewrite.

### `task_comments.author_id ON DELETE RESTRICT` blocks account deletion

**Active. Target: Wave 34 (Admin Management).** `task_comments.author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` (Wave 26). This matches `tasks.creator` / `project_members.user_id` — the RESTRICT was chosen deliberately per the Wave 26 plan so a comment can't go authorless while the app's `TaskCommentWithAuthor.author` contract treats non-soft-deleted rows as having an author. Trade-off: deleting an `auth.users` row is blocked if they've ever posted a comment (same blocker exists on the other two FKs).

The right fix is cross-cutting, not local: when the admin / account-deletion flow ships (Wave 34 Admin Management — the original Licensing/Monetization track that would have owned account deletion was descoped during the post-Wave-31 renumber), it needs to decide how to anonymise or reassign user-owned rows across all three tables (`tasks.creator`, `project_members.user_id`, `task_comments.author_id`, plus whatever Wave 27 adds on `activity_log` / presence). Options: (a) nullable FKs with `ON DELETE SET NULL` + tombstone display everywhere, (b) a `public.deleted_users` row-retention table that every FK can reassign to during account-deletion, (c) hard-delete cascade gated by an admin-only "purge" action. (b) is cleanest for GDPR audit trails.

Flagging at the Wave 26 level so the admin-flow plan doesn't miss `task_comments` when it audits the FK surface.

### Gantt PDF export

**Resolved (PR 10).** The gantt toolbar in `src/features/gantt/components/ProjectGantt.tsx` renders an enabled "Export PDF" button wired to `window.print()`. The accessible label instructs users to choose "Save as PDF" in the browser print dialog. The old disabled "coming soon" copy has been removed from runtime localization strings.
