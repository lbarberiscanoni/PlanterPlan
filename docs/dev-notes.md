# Dev Notes

Technical debt and architectural notes for the team.

## Wave 36 — Template Hardening

### Resolved (Wave 36)

- **Template versioning** — `public.tasks.template_version int NOT NULL DEFAULT 1` (migration `docs/db/migrations/2026_04_18_template_versioning.sql`). BEFORE UPDATE trigger `trg_bump_template_version` increments on template-row text/structural edits. `Task.clone` looks up the source template's version after the RPC lands and stamps `settings.cloned_from_template_version` on the cloned root. Deliberate non-propagation (edits to the template do NOT update existing instances) — admins spot drift in `/admin/templates` via a "stale" badge when an instance's stamp is behind the current template version.
- **Template immutability** — `public.tasks.cloned_from_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL` (migration `docs/db/migrations/2026_04_18_task_template_origin.sql`). Stamped server-side by `clone_project_template` per cloned descendant. `TaskDetailsView` delete guard: non-owners see a modal ("Only the project owner can delete template-origin tasks"); owners bypass and delete directly. `TaskItem` renders an indigo "T" badge with a "From template" Radix tooltip (reusing the Wave 33 primitive).
- **Admin Templates surface at `/admin/templates`** — cross-tenant template list with Version column + right-side "cloned instances" drilldown showing each instance's stamped version vs the template's current version. New lazy-loaded route registered under the Wave 34 AdminLayout.

### Active (Wave 36 → future)

- **Server-side delete enforcement** — v1 ships an app-side guard only; a per-row RLS policy would be brittle and owner-bypass is clearer in app code. Revisit if abuse reports materialize.
- **UI to "update this project to the latest template version"** — deferred (would require a three-way merge).
- **Tracking edits to template-origin tasks** — deferred; only deletion is gated for v1.

## Wave 35 — External Integrations (ICS)

### Active (Wave 35)

- ICS feeds are **read-only**. Two-way sync (Google Calendar / Outlook write-back) is deferred with no wave assigned.
- Single-task `.ics` download is deferred (the Wave 35 baseline is feed-only).
- HMAC-signed URLs with server-enforced expiry are deferred — Wave 35's opaque-token model is the v1 baseline; rotation is the only revocation story (soft-delete via `revoked_at`, new token generation per rotate).

### Resolved (Wave 35)

- **Per-user ICS calendar feeds** — `public.ics_feed_tokens` (migration `docs/db/migrations/2026_04_18_ics_tokens.sql`) + public edge function `supabase/functions/ics-feed/` returning `text/calendar` (RFC 5545). Tokens are 256-bit (`crypto.randomUUID()` × 2 → 64 hex chars). 404 on revoked/unknown. `last_accessed_at` bumped fire-and-forget on every successful fetch. Settings → Integrations tab (`src/features/settings/components/IcsFeedsCard.tsx`) exposes create + copy + soft-revoke. SSoT: `docs/architecture/integrations.md`.

## Wave 34 — Advanced Admin Management

### Resolved (Wave 34)

- **`/admin` shell** — `src/pages/admin/AdminLayout.tsx` (lazy-loaded in `App.tsx`) hard-gates every `/admin/*` route via `useIsAdmin()`; non-admins get a Sonner toast and redirect to `/dashboard`. Left-rail nav links to Home / Users / Analytics + shortcut links to Templates and Projects that route into the existing Project surfaces.
- **Global admin search** — `src/pages/admin/components/AdminSearch.tsx` debounces at 200ms (2-char min) and returns three parallel result groups (Users via `admin_search_users`, Projects + Templates via an in-memory filter of the task list). Click a row → canonical detail surface.
- **User-management table** — `src/pages/admin/AdminUsers.tsx` + `src/features/admin/hooks/useAdminUsers.ts`. Server-side filter via `admin_list_users(filter jsonb, limit, offset)`. Right-side detail aside populates via `useAdminUserDetail` (hits `admin_user_detail`). Deep-link via `/admin/users/:uid` (AdminSearch navigates here on user click).
- **Analytics dashboard** — `src/pages/admin/AdminAnalytics.tsx` + `src/features/admin/hooks/useAdminAnalytics.ts`. One RPC (`admin_analytics_snapshot`) backs every chart: totals cards, new-projects/week LineChart, project-kind PieChart, task-status BarChart, top-10 active users + popular templates. recharts already in the bundle — zero new deps.
- **Admin notifications on new project** — `trg_notify_admin_on_new_project` AFTER INSERT trigger (see `docs/db/migrations/2026_04_18_new_project_admin_notify.sql`). Enqueues one `notification_log` row per admin (excluding the creator) with `event_type = 'admin_new_project_pending'`. Downstream: Wave 30's `dispatch-notifications` cron delivers through each admin's email/push prefs + quiet hours. Closes the `dashboard-analytics.md` "Admin Notifications" known gap.
- **SECURITY DEFINER discipline** — every new RPC opens with `IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized: admin role required' END IF`. Loud on auth-fail, no silent empty-result degradation.

### Deferred (Wave 34 → future)

- **Admin user-management actions** (suspend / change role / reset password) — requires a server-side mutation surface that the UI doesn't yet expose. No wave assigned.
- **Bulk CSV export** of the user table — deferred, no wave assigned.
- **AdminAnalytics component-level test** — the hook layer carries the wiring coverage; recharts chart internals are the lib's responsibility.
- **AdminUsers component-level render test** — deferred; the `useAdminUsers.test.tsx` hook tests assert the query wiring. A component test would need extensive planterClient mocks to assert the drawer transition.
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
- **New Template button on Dashboard** — `src/pages/Dashboard.tsx` header surfaces a `variant="secondary"` button next to the existing New Project button that fires `actions.setShowTemplateModal(true)`. The modal was already mounted; only the trigger was missing.

### Audit note — dropped Task

The Wave 32 plan originally scoped a third task: "project due date does not persist after save" (cache invalidation on `useProjectMutations`). Pre-flight discovered the fix already lived on `main` from Wave 15 (commit `c88b3e7`), with its regression test in `Testing/unit/features/projects/hooks/useProjectMutations.test.ts` (commit `30616d8`). Task dropped; wave shipped as two tasks rather than three.

## Localization

### Spanish translation is machine-translated

**Active (Wave 31).** `src/shared/i18n/locales/es.json` was produced by a machine-translation pass from `en.json` at commit `63c77d8`. The file's `_meta.review_required_before_marketing: true` flag is enforced by `Testing/unit/shared/i18n/es-json.test.ts`. Quality is "good enough for an internal beta" but has not been reviewed by a native Spanish speaker. **Do not market "Spanish support" on the marketing site or app store listing until a human-review pass lands.** The pipeline itself (i18next + module augmentation + locale switcher + Intl formatters) is production-ready — future locales become a translator-only workflow per `docs/architecture/i18n.md` §"Adding a new locale."

### Deferred string-extraction surfaces

**Active (Wave 31).** Task 2's per-domain extraction landed 17 files (auth, nav, dashboard, project-create/edit, settings, notifications, reports, tasks page, Gantt page, onboarding wizard, login). The following surfaces retain hard-coded English and will be completed in a follow-up wave:

- `src/features/tasks/components/TaskDetailsView.tsx` family (dependencies section, related-tasks panel, resource rail, coaching/strategy badges)
- `src/features/people/components/AddPersonModal.tsx` — only the `Cancel` button was extracted in the Wave 31 finalize; labels, placeholders, roles enum, statuses enum, and the dynamic title still need work
- `src/pages/Home.tsx` marketing copy (if it exists / lands)
- Deep library views (`src/features/library/components/*` beyond the search input)
- Activity log event-type humanizers in `<ActivityRow>`
- Per-PR follow-up: see Wave 31 Task 2 PR description for the triage list

The `eslint-plugin-i18next no-literal-string` rule is intentionally NOT enabled yet — revisit once the surfaces above are extracted.

### React 18.3.1 pin (Wave 31 scope expansion)

**Active (Wave 31).** `package.json` pins `react`, `react-dom`, and `react-is` to exact `18.3.1`, with `@types/react`/`@types/react-dom` on `^18.3.x`. Originally intended to ship on React 19, but Vercel preview deploys were blocked by peer-dep and runtime incompatibilities under `--legacy-peer-deps`. Audit confirmed no React-19-only API usage (`use()`, `useActionState`, `useFormStatus`, server actions / `form action={fn}`, `ref` as a prop on function components, built-in `<title>`/`<meta>` in render trees). All UI primitives route refs via `React.forwardRef`; `main.tsx` uses `createRoot` from `react-dom/client`. `.npmrc` keeps `legacy-peer-deps=true` for `gantt-task-react@0.3.9` (peer: `react@^18`). Revisiting React 19 is not on the near-term roadmap — the rollback has no behavioral regressions in the test suite (791/791 passing).

## Database

### No type discriminator on `tasks`

**Resolved (Wave 25).** `public.tasks` now carries a `task_type text` column with a CHECK constraint (`'project' | 'phase' | 'milestone' | 'task' | 'subtask'`) and a supporting btree index. `public.derive_task_type(parent_task_id uuid)` returns the correct value by walking up to three levels of the parent chain. The `trg_set_task_type` BEFORE INSERT OR UPDATE OF `parent_task_id` trigger keeps `NEW.task_type` in lockstep so writers never have to set the column manually. Existing rows were backfilled by the migration. `'subtask'` stays reserved in the CHECK constraint for future use but isn't emitted today (the max-depth-1 subtask invariant lives in app code). Migration: `docs/db/migrations/2026_04_18_task_type_discriminator.sql`.

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

### `task_comments.author:users(...)` PostgREST join is typed-client-hostile

**Active. Target: Wave 30.** `planter.entities.TaskComment.{listByTask, create}` select `*, author:users(id, email, user_metadata)` across the `public`/`auth` schema boundary. The Supabase generated types don't model a FK from `task_comments.author_id` to `auth.users.id`, so the typed client surfaces a `SelectQueryError<"could not find the relation between task_comments and users">`. The current workaround casts through `unknown` and ships: at runtime PostgREST sometimes resolves the join, sometimes returns `author: null` (the row-level type already allows null, so the UI falls back to initials + "Unknown" via `<Avatar>`).

Problem: when the join fails silently, `TaskCommentWithAuthor.author` is `null` and the UI can't show a real name. More importantly, Wave 30's notification stack needs resolved `author_id → auth.users.email` for mention dispatch — the null-author case is a soft failure for display but a hard miss for notifications.

Fix in Wave 30 (prefer): ship a `public.list_task_comments_with_authors(p_task_id uuid)` SECURITY DEFINER RPC that JOINs `task_comments` against `auth.users` internally and returns the hydrated shape. Swap `listByTask` to `planter.rpc('list_task_comments_with_authors', { p_task_id: taskId })`. Drop the cross-schema PostgREST select. The RPC also centralises the `resolve_user_handles` path Wave 30 already plans to ship. Alternative: add a `public.comment_authors` view that mirrors the relevant `auth.users` columns with an RLS policy keyed on `is_active_member`, and switch the select to `author:comment_authors!author_id(...)` — less elegant but avoids the RPC round trip.

Until that lands, the UI degrades gracefully but any mention-based feature is blocked on a reliable author hydrate.

**Wave 30 status note:** Wave 30 Task 3 shipped `public.resolve_user_handles(text[])` (the handle-to-uuid mapping needed by `resolveMentions` in the write path), but did NOT ship the `list_task_comments_with_authors` read-path RPC suggested above. Mention dispatch works because the trigger reads `task_comments.mentions` (resolved uuids) directly; it doesn't depend on the display-side author hydrate. The PostgREST join issue remains — future work.

### Service worker JS exception (`public/sw.js`)

**Active. No wave assigned.** `public/sw.js` (Wave 30 Task 2 push handler) is the only non-TypeScript file in the application tree. The styleguide calls for TS-only across `src/`; the service worker carves out one documented exception because the TS → worker build path hasn't landed yet. The PWA / workbox track that would have subsumed this file was descoped during the post-Wave-31 roadmap renumber, so there is no active plan to subsume it — the exception stays documented until a future workbox (or equivalent) rewrite is scheduled.

Do not grow `sw.js`. The current handler implements `install` / `activate` / `push` / `notificationclick` and is the complete contract. Any additional SW responsibility (offline queue, asset precache) waits for the TS rewrite.

### `task_comments.author_id ON DELETE RESTRICT` blocks account deletion

**Active. Target: Wave 34 (Admin Management).** `task_comments.author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT` (Wave 26). This matches `tasks.creator` / `project_members.user_id` — the RESTRICT was chosen deliberately per the Wave 26 plan so a comment can't go authorless while the app's `TaskCommentWithAuthor.author` contract treats non-soft-deleted rows as having an author. Trade-off: deleting an `auth.users` row is blocked if they've ever posted a comment (same blocker exists on the other two FKs).

The right fix is cross-cutting, not local: when the admin / account-deletion flow ships (Wave 34 Admin Management — the original Licensing/Monetization track that would have owned account deletion was descoped during the post-Wave-31 renumber), it needs to decide how to anonymise or reassign user-owned rows across all three tables (`tasks.creator`, `project_members.user_id`, `task_comments.author_id`, plus whatever Wave 27 adds on `activity_log` / presence). Options: (a) nullable FKs with `ON DELETE SET NULL` + tombstone display everywhere, (b) a `public.deleted_users` row-retention table that every FK can reassign to during account-deletion, (c) hard-delete cascade gated by an admin-only "purge" action. (b) is cleanest for GDPR audit trails.

Flagging at the Wave 26 level so the admin-flow plan doesn't miss `task_comments` when it audits the FK surface.

### Gantt PDF export deferred

**Active. Target: Wave 34 (Admin Management).** The gantt toolbar in `src/features/gantt/components/ProjectGantt.tsx` renders a disabled "Export PDF" button with a `title="PDF export coming soon"` tooltip. Deferred because Wave 28 intentionally ships the core timeline render + drag-shift only; print/PDF export pairs better with the Wave 34 admin reporting surface (same user flow as report scheduling). No technical blocker — wire to `window.print()` with a gantt-only print stylesheet when Wave 34 lands, or use a headless-browser export from a Deno edge function if output fidelity matters.
