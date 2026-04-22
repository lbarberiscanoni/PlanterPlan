## Session Context

PlanterPlan is a church planting project management app (React 18 + TypeScript + Supabase + Vite). Read `CLAUDE.md` for conventions and architecture. Strict typing, Feature-Sliced Design (FSD) boundaries, no direct Supabase calls in components, no raw date math — all enforced. See `.gemini/styleguide.md` for the full bar.

Wave 33 shipped to `main`:
- Unified Tasks view (merged `/tasks` + `/daily`)
- Due-date range filter + daily-style due-date badges on task rows
- Task-row click opens the same `<TaskDetailsPanel>` the Project view uses
- Task-title hover tooltip listing the parent project name
- Shadcn `<Tooltip>` wrapper around `@radix-ui/react-tooltip`

**Roadmap note**: original Waves 32 (PWA + Offline), 34 (White Labeling), 35 (Stripe Monetization + Licensing), and 38 (Release Cutover) were descoped from the earlier plan, and wave numbers were reassigned to the current remaining scope. After Wave 34 (this wave) the active roadmap is: Wave 35 (ICS) → Wave 36 (template hardening).

Wave 34 ships **Advanced Admin Management** (§3.7). The existing `admin_users` whitelist already controls "is admin" gating; this wave lays a dedicated `/admin` route shell with global search, advanced user filtering, an analytics dashboard, and admin notifications on new project creation (closing the `dashboard-analytics.md` "Admin Notifications" gap that was actually deferred from Wave 30 — cleaning it up here).

**Test baseline going into Wave 34:** Run `npm test` and record. Lint baseline: 0 errors, ≤7 warnings — do not regress.

**Read `.claude/wave-testing-strategy.md` before starting.** Wave 34 specific: zero existing-test impact. New admin RPC mocks follow the existing planterClient pattern (`vi.mock('@/shared/api/planterClient', () => ({ planter: { admin: { searchUsers: vi.fn().mockResolvedValue([...]) }}}))`). E2E persona addition: extend `scripts/seed-e2e.js` to insert an `admin@example.com` user into `auth.users` AND `public.admin_users`; create `Testing/e2e/.auth/admin.json` via the global setup login flow.

## Pre-flight verification (run before any task)

1. `git log --oneline` includes the Wave 33 commits + docs sweep (not Wave 31 — Waves 32 and 33 land between 31 and this wave).
2. These files exist:
   - `src/app/App.tsx` (routes register here — NOT `router.tsx`; Wave 34 adds `/admin/*` routes). Routing pattern to mirror: the lazy-loaded `/gantt` route already in the file.
   - `src/shared/contexts/AuthContext.tsx` — as of 2026-04-22 pre-flight, this context hydrates `user.role` via `authApi.checkIsAdmin()` but does **not** export a dedicated `isAdmin` accessor. Task 1 must add either a `useIsAdmin()` hook or an `isAdmin` field on the `useAuth()` return, reading from the existing hydration path (no new RPC call per render).
   - `src/shared/api/planterClient.ts` (extend with `admin.*` namespace; `planter.rpc<T>(name, params)` is the existing helper to call from this namespace — no new RPC plumbing needed)
   - `src/shared/ui/command.tsx` exists (Shadcn `CommandDialog` wrapper around `cmdk` — already a dep). Task 1's global search uses it.
   - `docs/db/schema.sql` (must contain `is_admin(p_user_id uuid)` (Wave 23) and `is_active_member(uuid, uuid)` per Wave 23 schema map)
   - `recharts` is already a dep (Wave 19, 20, 28). `cmdk` is already a dep.
3. Confirm an admin user exists in your local Supabase: `SELECT * FROM public.admin_users WHERE user_id = auth.uid();` should return one row when logged in as the admin.
4. **Wave 27 `activity_log` RLS** — verified 2026-04-22 that the policy `"Activity log select by project members"` already reads `is_active_member(project_id, auth.uid()) OR public.is_admin(auth.uid())`, so admins can SELECT cross-project activity directly. Task 1's `admin_recent_activity` RPC still runs SECURITY DEFINER for consistency with the other admin RPCs; the `is_admin` OR in the policy is redundant but harmless — document as such in the RPC comment.

## Branch

One branch per task, cut from `main`:
- Task 1 → `claude/wave-34-admin-shell-search`
- Task 2 → `claude/wave-34-admin-user-filter`
- Task 3 → `claude/wave-34-admin-analytics`

Open a PR to `main` after each task's verification gate passes. Do **not** push directly to `main`.

## Wave 34 scope

Three tasks. Task 1 stands up the route shell + global search. Task 2 ships the user filter table. Task 3 builds the analytics dashboard + admin notifications.

---

### Task 1 — Admin shell + global search

**Commit:** `feat(wave-34): /admin route, layout, global search across users + projects + templates`

1. **Route + auth gate** (`src/pages/admin/AdminLayout.tsx`, `src/pages/admin/AdminHome.tsx`, NEW)
   - New `/admin` route. Hard-gated via `useAuth().isAdmin`; non-admins get redirected to `/dashboard` with a Sonner toast: "You need admin access for this page."
   - Layout: left sidebar with Admin nav (Home / Users / Templates / Projects / Analytics — Templates and Projects link to filtered views of the existing routes; Users and Analytics are new in this wave).
   - `AdminHome.tsx` renders the global search + recent activity (uses Wave 27's `entities.ActivityLog.listByProject` per project, but **cross-project** for admins — see step 4).

2. **Global search bar** (`src/pages/admin/components/AdminSearch.tsx`, NEW)
   - Header-positioned Shadcn `Command`/`CommandDialog` (cmd+K to open).
   - Searches three entity types in parallel:
     - **Users** — `auth.users` via a new SECURITY DEFINER RPC `public.admin_search_users(query text, limit int)` returning `{ id, email, display_name, last_sign_in_at, project_count }`.
     - **Projects** — `tasks WHERE parent_task_id IS NULL AND title ILIKE '%query%'`.
     - **Templates** — `tasks WHERE origin = 'template' AND title ILIKE '%query%'`.
   - Results grouped by type with icons. Click → navigates to the appropriate detail surface (user → `/admin/users/:id`; project → `/Project/:projectId` — note capital P, matches the existing route in `src/app/App.tsx`; template → existing template editor surface, find via grep).
   - Debounce 200ms; minimum 2 chars to fire.

3. **Admin RPCs** (`docs/db/migrations/2026_04_18_admin_rpcs.sql`, NEW). Every admin RPC follows this exact pattern (Sonnet-friendly template — copy verbatim, swap body):

```sql
CREATE OR REPLACE FUNCTION public.<name>(<params>)
RETURNS <return_type>
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized: admin role required';
  END IF;
  RETURN QUERY <body>;  -- or RETURN <body> for jsonb returns
END;
$$;

REVOKE ALL ON FUNCTION public.<name>(<params>) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.<name>(<params>) TO authenticated;
```

The three RPCs:
   - `public.admin_search_users(p_query text, p_max_results int DEFAULT 20) RETURNS TABLE(id uuid, email text, display_name text, last_sign_in_at timestamptz, project_count bigint)` — joins `auth.users` with `LATERAL (SELECT count(*) FROM public.project_members WHERE user_id = u.id) AS pm`.
   - `public.admin_user_detail(p_uid uuid) RETURNS jsonb` — returns `{ profile: {...}, projects: [...], task_counts: { assigned, completed, overdue }, last_login: ... }`.
   - `public.admin_recent_activity(p_limit int DEFAULT 50) RETURNS TABLE(id uuid, project_id uuid, actor_id uuid, actor_email text, entity_type text, entity_id uuid, action text, payload jsonb, created_at timestamptz)` — joins `activity_log` with `auth.users` on actor.
   - Mirror all three into `docs/db/schema.sql`.

4. **Cross-project activity** (Wave 27 extension)
   - The Wave 27 RLS on `activity_log` restricts SELECT to project members. Admins inherit via `is_admin(auth.uid())` in that policy. Verify the policy already covers admins; if not, **don't** rewrite the policy — instead route the admin recent-activity feed through the new `admin_recent_activity` RPC (SECURITY DEFINER) which bypasses RLS.

5. **planterClient** (`src/shared/api/planterClient.ts`)
   - `admin.searchUsers(query, limit?)`, `admin.userDetail(uid)`, `admin.recentActivity(limit?)`.

6. **Tests**
   - `Testing/unit/pages/admin/AdminLayout.test.tsx` (NEW) — non-admin redirect with toast.
   - `Testing/unit/pages/admin/components/AdminSearch.test.tsx` (NEW) — debounce, min-length, result grouping, navigation.
   - Manual `psql` smoke at `docs/db/tests/admin_rpcs.sql` — non-admin call to each RPC raises; admin call returns expected shape.

**DB migration?** Yes — three SECURITY DEFINER RPCs.

**Out of scope:** Admin user-management actions (suspend, reset password) — deferred to a Wave 34.5 if user demand justifies. Admin RLS rewrites (none needed; existing `is_admin(auth.uid())` clauses cover SELECT scope). Cross-project bulk operations — deferred.

---

### Task 2 — User-management table

**Commit:** `feat(wave-34): /admin/users with filtering by role, last login, task completion`

1. **New page** (`src/pages/admin/AdminUsers.tsx`, NEW)
   - Table view of all users (paginated; default 50/page).
   - Columns: Email, Display Name, Role (admin / standard), Last Sign In, Active Projects, Completed Tasks (last 30 days), Overdue Tasks.
   - Filters (above the table):
     - Role: All / Admin / Standard.
     - Last Login: All / Last 7 days / Last 30 days / 30+ days inactive.
     - Has overdue: Toggle.
     - Search: by email or display name (debounced).
   - Sort: by any column (default Last Sign In DESC).
   - Click a row → drawer with full `admin_user_detail` (project memberships table, task summary, recent activity).

2. **Hook** (`src/features/admin/hooks/useAdminUsers.ts`, NEW)
   - `useAdminUsers(filters)` — `useQuery({ queryKey: ['adminUsers', filters] })`. Backed by a new RPC `admin_list_users(filter jsonb)` that pushes the filter to the server (vs. fetching all + client-side filter — important when user count grows).
   - `useAdminUserDetail(uid)` — `useQuery({ queryKey: ['adminUserDetail', uid], enabled: !!uid })`.

3. **Migration** (`docs/db/migrations/2026_04_18_admin_list_users_rpc.sql`, NEW)
   - `public.admin_list_users(filter jsonb, limit int, offset int) RETURNS TABLE(...)` — SECURITY DEFINER, gated by `is_admin(auth.uid())`.
   - Filter shape: `{ role?: string, lastLogin?: 'last_7' | 'last_30' | 'inactive', hasOverdue?: boolean, search?: string }`.
   - Joins `auth.users` with a CTE for task counts and a flag column for overdue presence.
   - Mirror into `docs/db/schema.sql`.

4. **Tests**
   - `Testing/unit/features/admin/hooks/useAdminUsers.test.tsx` (NEW)
   - `Testing/unit/pages/admin/AdminUsers.test.tsx` (NEW) — filter changes invalidate; row click opens drawer; drawer shows detail.

**DB migration?** Yes — one RPC.

**Out of scope:** Admin user-management actions (suspend, change role for a non-admin, reset password) — deferred. Bulk export to CSV — deferred (no wave assigned).

---

### Task 3 — Analytics dashboard + admin notifications on new project

**Commit:** `feat(wave-34): /admin/analytics + admin notification on new project creation`

1. **Analytics page** (`src/pages/admin/AdminAnalytics.tsx`, NEW)
   - Cards (top row): Total Users, Total Projects, Active (last 30d) Projects, New Users (last 30d).
   - Time-series chart: New projects per week for the last 12 weeks (recharts line chart).
   - Pie chart: Project breakdown by `settings.project_kind` (date / checkpoint).
   - Stacked bar chart: Task statuses across all projects (todo / in_progress / completed / blocked / overdue).
   - Top-10 lists: Most active users (by task creation last 30d), Most popular templates (by clone count).

2. **Hook + RPC** (`src/features/admin/hooks/useAdminAnalytics.ts`, NEW)
   - `useAdminAnalytics()` — `useQuery({ queryKey: ['adminAnalytics'], staleTime: 5 * 60 * 1000 })`. Backed by a single `public.admin_analytics_snapshot()` RPC that returns a JSONB blob containing every chart's payload (avoids 5 round-trips).
   - Migration `docs/db/migrations/2026_04_18_admin_analytics_rpc.sql` (NEW).

3. **Admin notification on new project** (`docs/db/migrations/2026_04_18_new_project_admin_notify.sql`, NEW)
   - `CREATE FUNCTION public.notify_admin_on_new_project() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$ ... $$`. AFTER INSERT on `tasks` WHERE `parent_task_id IS NULL AND origin = 'instance'`.
   - For each row in `admin_users`, INSERT a `notification_log` row with `event_type = 'admin_new_project_pending'`. The Wave 30 `dispatch-notifications` cron picks it up and emails / pushes per the admin's preferences.
   - Honors `notification_preferences` exactly like every other notification path — admins can opt out via Settings.
   - Mirror into `docs/db/schema.sql`.
   - Closes `dashboard-analytics.md` "Admin Notifications" gap.

4. **Architecture doc** (`docs/architecture/dashboard-analytics.md`)
   - Flip "Admin Notifications" from TODO to **Resolved (Wave 34)** with pointer to the migration + the `notify_admin_on_new_project()` trigger.
   - Append `## Admin Analytics (Wave 34)` section: page composition + RPC backing + chart inventory.

5. **Tests**
   - `Testing/unit/features/admin/hooks/useAdminAnalytics.test.tsx` (NEW)
   - `Testing/unit/pages/admin/AdminAnalytics.test.tsx` (NEW) — empty-state when no projects exist; charts render with mock RPC data.
   - Manual `psql` smoke at `docs/db/tests/new_project_admin_notify.sql` — INSERT a project root → assert `notification_log` rows materialize one per admin.

**DB migration?** Yes — two RPCs + one trigger.

**Out of scope:** Drilldown from analytics charts (defer — recharts native click handlers are fine if needed). User-segment analytics (cohort retention, etc.) — defer. Per-organization analytics (White Labeling was descoped — no wave assigned).

---

## Documentation Currency Pass (mandatory — before review)

1. **`spec.md`** — flip §3.7 Advanced Admin Management from `[ ]` to `[x]` with sub-bullets per task. Bump version to **1.18.0**. Update `Last Updated`.
2. **`docs/AGENT_CONTEXT.md`** — add "Admin Surface (Wave 34)" golden-path bullet.
3. **`docs/architecture/dashboard-analytics.md`** — Admin Analytics section + Admin Notifications gap → Resolved.
4. **`docs/architecture/auth-rbac.md`** — append "Admin RPCs (Wave 34)" sub-section: lists the four new RPCs and the SECURITY DEFINER + `is_admin` gate pattern.
5. **`docs/architecture/notifications.md`** — append a one-line entry: "Wave 34 admin-new-project trigger uses the same `notification_log` pipeline; admin opt-out via Settings."
6. **`docs/dev-notes.md`** — no entry expected. Confirm currency.
7. **`repo-context.yaml`** — bump `wave_status.current` to `Wave 34 (Admin Management)`, update `last_completed`, `spec_version`, add `wave_34_highlights:` block.
8. **`CLAUDE.md`** — add `/admin/*` routes to Routes table. New "Admin SECURITY DEFINER RPCs" subsection naming the four RPCs. Note that `admin_users` whitelist gates everything via `is_admin(auth.uid())`.

Land docs as `docs(wave-34): documentation currency sweep`.

## Wave Review (mandatory — before commit + push to main)

1. **Auth gate strict** — non-admin user → `/admin` → redirected with toast. Try direct API calls to each RPC as non-admin → "unauthorized" raised. Admin user can hit every RPC.
2. **Search debouncing** — verify 200ms debounce; rapid typing doesn't fan out network requests.
3. **Filter behavior** — every filter on `AdminUsers` invalidates and refetches with the new filter; sort persists across pagination.
4. **Analytics performance** — single round-trip (one RPC); page loads under 500ms with cache hit, under 2s on cache miss.
5. **Admin notifications** — create a project as a non-admin; admin (with default prefs) gets the notification within one cron tick.
6. **No FSD drift** — admin pages live in `src/pages/admin/`; admin features in `src/features/admin/`; no shared imports back from features.
7. **Type drift** — `database.types.ts` may need RPC return shape additions; hand-edit cleanly.
8. **Test-impact reconciled** — admin RPC tests include the "non-admin caller raises 'unauthorized'" branch; `seed-e2e.js` extended for the admin persona + `e2e/.auth/admin.json` generated by global-setup; no `it.skip`. Test count ≥ baseline + new tests.
9. **Lint + build + tests** — green per `.claude/wave-execution-protocol.md` §4 (HALT on any failure).

## Commit & Push to Main (mandatory — gates Wave 35)

After all three Tasks merge:
1. `git checkout main && git pull && npm install && npm run lint && npm run build && npx vitest run`.
2. The history should show: 3 task commits + 1 docs sweep commit on top of Wave 33.
3. Push to `origin/main`. CI green.
4. **Do not start Wave 35** until the above is true.

## Verification Gate (per task, before push)

**Every command below is a HALT condition per `.claude/wave-execution-protocol.md` §4. Admin RPC tests must include the unauthorized-persona case (per §8.2 RLS halt protocol).**

```bash
npm run lint      # 0 errors required (≤7 pre-existing warnings tolerated). FAIL → HALT.
npm run build     # clean (tsc -b && vite build; verify /admin/* lazy-loaded). FAIL → HALT.
npm test          # 100% pass rate; count ≥ baseline + new tests. FAIL → HALT.
git status        # clean
```

Manual smoke (see Wave Review).

## Key references

- `CLAUDE.md` — conventions, commands, architecture overview
- `.gemini/styleguide.md` — strict typing, FSD boundaries, Tailwind constraints, no arbitrary values
- `docs/architecture/auth-rbac.md` — `is_admin(auth.uid())` is the only admin gate; reuse it everywhere
- `docs/architecture/dashboard-analytics.md` — Admin Notifications gap closing in this wave
- `docs/architecture/notifications.md` — Wave 30 dispatch pipeline; Task 3 hooks into it
- `src/features/projects/components/ProjectSwitcher.tsx` — `Command` UX precedent for global search
- `src/pages/Reports.tsx` — recharts pattern for analytics dashboard

## Critical Files

**Will edit:**
- `src/app/App.tsx` — add `/admin/*` routes (lazy-loaded; mirrors Wave 28's `/gantt` pattern)
- `src/shared/api/planterClient.ts` (`admin.*`)
- `src/shared/db/database.types.ts` (RPC return shapes)
- `docs/architecture/dashboard-analytics.md` (Analytics section + Notification gap → Resolved)
- `docs/architecture/auth-rbac.md` (Admin RPCs subsection)
- `docs/architecture/notifications.md` (admin-new-project one-liner)
- `docs/AGENT_CONTEXT.md` (Wave 34 golden path)
- `docs/dev-notes.md` (currency check)
- `spec.md` (flip §3.7 Admin to `[x]`, bump to 1.18.0)
- `repo-context.yaml` (Wave 34 highlights)
- `CLAUDE.md` (Routes + Admin RPCs)

**Will create:**
- `docs/db/migrations/2026_04_18_admin_rpcs.sql`
- `docs/db/migrations/2026_04_18_admin_list_users_rpc.sql`
- `docs/db/migrations/2026_04_18_admin_analytics_rpc.sql`
- `docs/db/migrations/2026_04_18_new_project_admin_notify.sql`
- `docs/db/tests/admin_rpcs.sql`
- `docs/db/tests/new_project_admin_notify.sql`
- `src/pages/admin/AdminLayout.tsx`
- `src/pages/admin/AdminHome.tsx`
- `src/pages/admin/AdminUsers.tsx`
- `src/pages/admin/AdminAnalytics.tsx`
- `src/pages/admin/components/AdminSearch.tsx`
- `src/features/admin/hooks/useAdminUsers.ts`
- `src/features/admin/hooks/useAdminAnalytics.ts`
- `Testing/unit/pages/admin/AdminLayout.test.tsx`
- `Testing/unit/pages/admin/AdminUsers.test.tsx`
- `Testing/unit/pages/admin/AdminAnalytics.test.tsx`
- `Testing/unit/pages/admin/components/AdminSearch.test.tsx`
- `Testing/unit/features/admin/hooks/useAdminUsers.test.tsx`
- `Testing/unit/features/admin/hooks/useAdminAnalytics.test.tsx`

**Explicitly out of scope this wave:**
- Admin user-management actions (suspend, change role)
- Bulk CSV export (no wave assigned)
- Drilldown from analytics charts
- Cohort / retention analytics
- Per-organization analytics (White Labeling was descoped)
- Admin push subscription UI (admins use the existing per-user prefs from Wave 30)

## Ground Rules (non-negotiable — from `CLAUDE.md` + `.gemini/styleguide.md`)

TypeScript-only; no `.js` / `.jsx`; no barrel files (import directly from concrete paths); path alias `@/` → `src/`; no raw date math (admin analytics time-series use `date-engine` for week boundaries); no direct `supabase.from()` in components (admin pages use `planterClient.admin.*`); Tailwind utility classes only (no arbitrary values, no pure black — use `slate-900` / `zinc-900`); optimistic mutations must force-refetch on error (admin pages are mostly read-only — N/A for most paths); max subtask depth = 1; template vs instance clarified on any cross-cutting work; only add dependencies if truly necessary (Wave 34 should add **zero** new npm deps — recharts is already in the bundle); atomic revertable commits; build + lint + tests all clean before every push; DB migrations are additive-only; SECURITY DEFINER functions MUST gate via `is_admin(auth.uid())` at the very top of the function body and `RAISE EXCEPTION 'unauthorized'` on failure (don't return empty / silent — make the auth-fail loud).
