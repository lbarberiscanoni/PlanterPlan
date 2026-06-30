# CLAUDE.md — PlanterPlan

Church planting project management app built with React + TypeScript + Supabase.

## Quick Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # TypeScript check + Vite production build (tsc -b && vite build)
npm run lint         # ESLint (zero-tolerance)
npm run test:e2e     # Playwright browser e2e — smoke + regression (runs against a deployed URL; see Testing & Regression Policy)
```

> There is no unit-test suite. The vitest suite under `Testing/` was removed; the only automated tests are the Playwright e2e suite under `e2e/`.

**Always run `npm run build` after code changes to verify.** The build enforces `noUnusedLocals` and `noUnusedParameters` — unused variables are errors, not warnings.

## Architecture & Single Source of Truth (SSoT)

> **CRITICAL:** For all domain business rules, state machines, and data models, refer strictly to **`docs/architecture/*.md`**. Those domain-separated files represent the definitive Single Source of Truth. Read them before attempting architectural refactors.

### Feature-Sliced Design (FSD)

PlanterPlan follows a strict Feature-Sliced Design (FSD) architecture organized by domains (e.g., `projects`, `tasks`, `people`, `dashboard`, `library`).

**Boundary rules (ESLint-enforced):**
- `shared/` cannot import from `features/` or `app/`.
- `features/` cannot import from `app/`.
- Features import from each other via direct paths (no barrel files).

> **For a detailed, up-to-date breakdown of the directory structure, the API layers, and the core routing, please read [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md).**

### Data Flow

```
Component → React Query hook → planterClient → Supabase SDK
```

- **planterClient.ts**: All DB access. Never call `supabase.from()` directly.
- **React Query**: Server state. Mutations use `useTaskMutations` / `useProjectMutations` with optimistic updates.
- **AuthContext**: Session, profile, role hydration.
- **Realtime**: `Project.tsx` subscribes to Supabase realtime channels for live task updates.

### Key Domain Concepts

- **Tasks and Projects share one DB table** (`tasks`). A "project" is a root task (`parent_task_id = null`). Hierarchy is `root_id` + `parent_task_id`.
- **origin** field: `'template'` (library templates) vs `'instance'` (active projects).
- **date-engine** (`src/shared/lib/date-engine/`): Handles date calculations, cascading parent dates, relative scheduling. Modify with care.
- **Max Subtask Depth:** Subtasks cannot have child tasks (Maximum depth = 1). The drag-and-drop system actively rejects deep nesting invariants.

## Tech Stack

- **React 18.3.1** + **TypeScript** (strict mode, ES2022 target). Pinned exact; the Wave 31 scope expansion rolled back from React 19 to unblock Vercel preview deploys. No React 19-only APIs (`use()`, `useActionState`, `useFormStatus`, server actions, `ref`-as-prop, built-in document metadata) are in the tree.
- **Vite** (build + dev server)
- **Supabase** (Postgres, Auth, Realtime, Edge Functions)
- **TanStack React Query v5** (server state)
- **i18next** + **react-i18next** + **i18next-browser-languagedetector** (Wave 31 localization — en baseline + es machine-translated; switcher in Settings → Profile)
- **Tailwind CSS v4** + **Radix UI** + **Shadcn** components
- **dnd-kit** (drag and drop)
- **Lucide React** (icons)
- **Sonner** (toast notifications)
- **gantt-task-react** `0.3.9` (pinned exact; Wave 28 Gantt Chart — lazy-loaded)

## Conventions

- **TypeScript only** — no `.js` or `.jsx` files. Ever. (One documented exception: `public/sw.js`, the Wave 30 push-notification service worker. TS conversion is not currently scheduled — the PWA/workbox track that would have subsumed this file was descoped during the post-Wave-31 roadmap renumber. See `docs/dev-notes.md`.)
- **No barrel files** — import directly from component/hook paths.
- **Path alias**: `@/` maps to `src/`. Use `@/features/...`, `@/shared/...`, etc.
- **Types**: Derived from Supabase generated types in `src/shared/db/database.types.ts`, re-exported as domain types in `src/shared/db/app.types.ts`.
- **No direct Supabase calls in components** — go through `planterClient` or mutation hooks.
- **Styling**: Tailwind utility classes only. No custom CSS files. Use `class-variance-authority` for variants.
- **Localization (Wave 31)**: every user-visible string in JSX, attribute values (`aria-label`, `placeholder`, `title`), and toast calls must resolve via `t('namespace.key')` from `react-i18next`. Source strings live in `src/shared/i18n/locales/en.json`; translations in sibling files (currently `es.json`). Namespaces: `common, nav, onboarding, auth, tasks, projects, library, dashboard, settings, notifications, errors`. Display-time date/number/currency formatting routes through `src/shared/i18n/formatters.ts` (Intl-based); internal date math stays on `src/shared/lib/date-engine`. Locale persisted to `localStorage.planterplan.locale` via the `LocaleSwitcher` in Settings → Profile. **`es.json` is machine-translated — see `docs/dev-notes.md`; do not market "Spanish support" until a human-review pass lands.** A few surfaces remain un-extracted (TaskDetailsView family, Home marketing, deep library views) — follow-up wave tracked in dev-notes.

## Testing & Regression Policy

> **A bug is a missing assertion.** When you fix a user-visible bug or change a behavioral rule, add or tighten the test that would have caught it **in the same change** — phrased as the specific nuance, not "the feature works." The fix and its guard ship together, or the fix is incomplete.

**When a fix earns a test:**
- **Behavioral rules, parity bugs (add vs. edit forms), scoping/RLS gating, cascade/rollup, cross-project labeling, logic with an observable UI effect** → a browser **e2e** test under `e2e/`, tagged `@regression` plus its feature tag.
- **Skip** for pure copy/cosmetic changes and one-off data cleanup.

> There is **no unit-test harness** — the vitest suite was removed. e2e is the only automated test layer. Pure-logic edge cases that aren't observable in the browser currently have no regression net; if you fix one, note it.

**Tag taxonomy** (Playwright `--grep`): `@smoke` (core loop, runs per-PR), `@regression` (a scar from a specific fix), plus one feature tag — `@templates @library @resources @tasks @projects @dates @admin @account`. Each `@regression` spec carries a one-line comment linking the commit or stakeholder item it guards, so the test documents *why* it exists.

**Status:** the e2e suite under `e2e/` is live and green — 6 `@smoke` flows + several `@regression` specs (4 `fixme` pending template-tree fixtures) + a `@reaper` cleanup project. Teardown/reaper run through the `e2e_purge_tagged` RPC (migrations `20260629040000`/`050000`).

**How the suite runs** (see `docs/qa/` for the full flow list):
- e2e hits a **deployed URL** (local can't reach remote Supabase; no local Docker), using the seeded `test-user.{admin,planter,team}@mail.com` accounts.
- Tests create data tagged `[e2e-<runId>]` and tear it down by tag + creator in `globalTeardown`; a nightly reaper sweeps stragglers. **There is no separate test DB — cleanup runs against live Supabase, so teardown is tag-scoped and owner-pinned.**
- **Per-PR:** `@smoke` only. **Nightly / pre-release:** full `@regression`. Never gate `main` on the full suite — smoke gates, regression reports.

**Enforcement:** `.github/workflows/test-guard.yml` warns when a PR touches `src/features/**` as a fix without a matching `e2e/**` change. It's a soft nudge, not a hard block — but the expectation above stands.

## Routes

```
/login          → LoginForm
/dashboard      → Dashboard (default after login)
/reports        → Reports
/project/:id    → Project detail
/tasks          → TasksPage (unified Task view — Wave 33 merged /daily into this surface; due-date badges + range filter; row click opens TaskDetailsPanel; title hover reveals parent project)
/daily          → redirects to /tasks (bookmark compatibility after the Wave 33 merge)
/settings       → Settings
/gantt          → Gantt (lazy-loaded; reads ?projectId=:id)
/admin          → AdminHome (Wave 34; lazy-loaded, useIsAdmin-gated — non-admins are toasted + redirected to /dashboard)
/admin/users    → AdminUsers (server-side-filtered table of auth.users with drill-down aside)
/admin/users/:uid → AdminUsers pre-selecting that user (deep-link from AdminSearch)
/admin/analytics → AdminAnalytics (recharts-backed snapshot dashboard)
```

## Environment

```
VITE_SUPABASE_URL         # Supabase project URL
VITE_SUPABASE_ANON_KEY    # Supabase anon key

# Wave 30 — Push notifications (server-only except the public key)
VITE_VAPID_PUBLIC_KEY     # VAPID public key (committed to bundle)
VAPID_PRIVATE_KEY         # VAPID private key — Supabase secret only
VAPID_SUBJECT             # mailto:ops@planterplan.example — Supabase secret/env
```

Local Supabase: API on `:54321`, DB on `:54322`, Studio on `:54323`.

### Cron Jobs / Scheduled Tasks

`pg_cron` is intentionally NOT enabled in this codebase. Every cron-driven edge function (currently `nightly-sync`, `supervisor-report`, `dispatch-notifications`, `overdue-digest`) is scheduled externally by the operator. See `docs/operations/edge-function-schedules.md` for the full schedule table and setup options (Supabase Dashboard → Scheduled Triggers preferred, GitHub Actions cron acceptable, external pinger as last resort). All dispatchers are idempotent under any scheduler.

## Supabase RLS & Database Functions

RLS is enabled on all tables. Authorization is role-based per project.

### Schema Overview

**Tables:**
- **`tasks`** — Core table. Projects are root tasks (`parent_task_id = null`, `root_id = id`). Subtasks form a tree via `parent_task_id`. Hierarchy: Project → Phase → Milestone → Task.
- **`project_members`** — User-project membership. `(project_id, user_id)` unique. `role` column controls access.
- **`people`** — Contacts/people per project (not auth users). Has `project_id` FK.
- **`task_resources`** — Attachments on tasks. `resource_type` enum, optional `storage_bucket`/`storage_path` for files.
- **`task_relationships`** — Links between tasks (`from_task_id` → `to_task_id`, `type` defaults to `'relates_to'`).
- **`admin_users`** — Admin whitelist. `user_id` + `email`.
- **`task_comments`** — Threaded comments per task. RLS by project membership; soft-delete via `deleted_at`. Wave 26.
- **`activity_log`** — Append-only audit trail. RLS by project membership; INSERT denied at policy level. Wave 27.
- **`notification_preferences`** — Per-user singleton (PK = `user_id` → `auth.users`). Bootstrap trigger on `auth.users` seeds a row on signup. Per-event email/push toggles, overdue-digest cadence (`off`/`daily`/`weekly`), quiet hours (start/end + IANA timezone). Wave 30.
- **`notification_log`** — Append-only notification audit trail. `channel ∈ {'email','push'}`, `event_type` carries the dispatch state-machine phase. RLS denies INSERT/UPDATE/DELETE at policy level — only SECURITY DEFINER dispatch edge functions write. Wave 30.
- **`push_subscriptions`** — One row per (user, browser endpoint). `UNIQUE (user_id, endpoint)`. Client inserts on subscribe, DELETEs on unsubscribe. `dispatch-push` DELETEs stale rows on HTTP 410. Wave 30.
- **`ics_feed_tokens`** — One row per user-generated ICS calendar feed token. `UNIQUE (token)`. Client generates 256-bit tokens via `crypto.randomUUID()` × 2. Revocation is soft (`revoked_at IS NOT NULL`). Public edge function `supabase/functions/ics-feed/` accepts the token and returns `text/calendar`. Wave 35.

**Views:**
- **`tasks_with_primary_resource`** — Tasks LEFT JOINed with their primary `task_resources` row. Used by `planterClient.ts` for reads.

**Key `tasks` columns:**
- `root_id` — Points to the project (root task). Auto-set by `set_root_id_from_parent()` trigger.
- `origin` — `'template'` (library) or `'instance'` (active project).
- `status` — Text enum: `'todo'`, `'not_started'`, `'in_progress'`, `'completed'`.
- `is_complete` — Boolean completion flag (used by `check_phase_unlock` trigger).
- `is_locked` / `prerequisite_phase_id` — Phase locking system.
- `position` — Sort order among siblings.
- `settings` — JSONB. Canonical keys: `published`, `recurrence`, `spawnedFromTemplate`/`spawnedOn`, `due_soon_threshold`, `is_coaching_task`, `is_strategy_template`, `project_kind` (`'date' | 'checkpoint'` on roots only, Wave 29), `phase_lead_user_ids` (string[] on phase/milestone rows, Wave 29), `cloned_from_template_version` (int on cloned roots, Wave 36 — stamps the source template's `template_version` at clone time). **Wave 29:** `settings.project_kind` gates the date-engine + nightly-sync urgency passes; `settings.phase_lead_user_ids` widens UPDATE access via the `"Enable update for phase leads"` RLS policy (CTE walks from parent — leads may edit tasks UNDER a phase, not the phase row itself).
- `template_version` — Wave 36. Monotonic int on template rows, bumped by `trg_bump_template_version` BEFORE UPDATE trigger whenever a template's title / description / days_from_start / duration / settings change.
- `cloned_from_task_id` — Wave 36. FK to `public.tasks(id) ON DELETE SET NULL`. NULL on custom additions; points to the source template task on every cloned descendant. Backs the app-side delete guard in `TaskDetailsView`.
- `days_from_start` — Relative scheduling offset.
- `assignee_id` — FK to auth user.

### Role Hierarchy

`Admin > Planter > Team` (collapsed from 5 roles on 2026-05-15).

- **Admin** — global `admin_users` whitelist (P4P staff). Bypasses every project RLS gate, exclusively creates/edits templates, owns the `/admin/*` surface.
- **Planter** — `project_members.role = 'planter'`. Per-project top role: full task CRUD plus invite/manage members and project settings. Cannot edit templates.
- **Team** — `project_members.role = 'team'`. Full task CRUD plus comments. Cannot invite or manage members.

The Coach role + `is_coaching_task` trigger and the Wave 29 viewer/limited Phase Lead carve-out were dropped in migration `20260515000000_role_hierarchy_collapse.sql`. See `docs/architecture/auth-rbac.md` for the full permission matrix.

### Admin SECURITY DEFINER RPCs (Wave 34)

Every `/admin/*` read goes through a SECURITY DEFINER RPC gated at the top of the function body by `IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized: admin role required' END IF`.

- **`admin_search_users(query, limit)`** — fuzzy email / full_name search across `auth.users`.
- **`admin_user_detail(uid)`** — profile + project memberships + task counts as `jsonb`.
- **`admin_recent_activity(limit)`** — cross-project activity feed joined with actor email.
- **`admin_list_users(filter jsonb, limit, offset)`** — paginated user list with server-side role / last-login / has-overdue / search filters.
- **`admin_analytics_snapshot()`** — one-jsonb dashboard payload (totals + time series + breakdowns + top-10s).

The `admin_users` whitelist is the sole admin gate — `is_admin(auth.uid())` returns true iff a row exists for the calling user. Client wrappers live under `planter.admin.*`.

### Core RLS Helper Functions (SECURITY DEFINER)

- **`has_project_role(pid, uid, roles[])`** — Primary gate. Used in nearly every policy. Checks `project_members` for matching role.
- **`is_admin(uid)`** — Checks `admin_users` table. Used as fallback override in every policy.
- **`check_project_ownership_by_role(pid, uid)`** — Checks `project_members.role = 'planter'`. Used by member-management policies.
- **`check_project_creatorship(pid, uid)`** — Checks `tasks.creator = uid`. Used to bootstrap the very first project_members row at project creation.
- **`is_active_member(pid, uid)`** — Checks existence in `project_members` (any role).

### RLS Policy Pattern

Most tables follow the same pattern after the 2026-05-15 collapse:
- **SELECT**: project members (Planter or Team) OR admin
- **INSERT/UPDATE/DELETE on tasks**: any project member OR creator OR admin
- **INSERT/UPDATE/DELETE on people / project_invites / project_members**: Planter OR admin
- **`tasks` table**: also allows `creator` to read/update/delete their own tasks; templates (`origin = 'template'`) are publicly readable by authenticated users and writable only by admins
- **`task_comments`**: INSERT allowed for any project member.

### Trigger Functions (on `tasks` table)

- **`set_root_id_from_parent()`** — INSERT/UPDATE: auto-sets `root_id` from parent's root_id
- **`calc_task_date_rollup()`** — INSERT/UPDATE/DELETE: rolls up `min(start_date)` / `max(due_date)` to parent (recursive with depth guard)
- **`handle_updated_at()`** — UPDATE: sets `updated_at = now()`
- **`check_phase_unlock()`** — UPDATE: when `is_complete = true`, checks if all tasks in a phase are done, unlocks dependent phases via `prerequisite_phase_id`
- **`handle_phase_completion()`** — UPDATE: when `status = 'completed'`, unlocks next sibling by `position`

### RPC Functions (called from app)

- **`initialize_default_project(pid, uid)`** — Creates hardcoded 6-phase project scaffold. Called from `planterClient.ts` on project creation.
- **`clone_project_template(template_id, parent_id, origin, uid, ...)`** — Deep-clones a task subtree with date shifting and resource cloning. Called from `planterClient.ts`.
- **`is_admin(uid)`** — Also called as RPC from `auth.ts` for client-side admin checks.

### Known Issues

- **`check_project_ownership` checks creatorship, not ownership**: the function checks `tasks.creator`, not the `owner` role in `project_members`. **Renamed + audited (Wave 23):** `check_project_creatorship(pid, uid)` now holds the correctly-named implementation; `check_project_ownership` is a shim delegating to it so the four RLS policies on `project_members` continue evaluating identically. Per-policy intent audit lives in `docs/architecture/auth-rbac.md`; the policy rewrite is deferred to a follow-up wave.

### Resolved

- **Dual completion signals** *(resolved Wave 23)*: `is_complete` and `status = 'completed'` are now kept in lockstep by the `sync_task_completion_flags` BEFORE INSERT/UPDATE trigger on `public.tasks`. `status` is the source of truth; inconsistent dual-field writes are reconciled unconditionally. See `docs/architecture/tasks-subtasks.md` and migration `docs/db/migrations/2026_04_17_sync_task_completion.sql`.

## Critical Files

- `docs/architecture/*.md` — **SINGLE SOURCE OF TRUTH.** Read these domain files before attempting architectural refactors.
- `docs/db/schema.sql` — Database schema source of truth
- `src/shared/api/planterClient.ts` — All CRUD + business logic (hierarchy, cloning, cascading dates)
- `src/shared/contexts/AuthContext.tsx` — Auth state, session, role hydration
- `src/shared/lib/date-engine/index.ts` — Date calculations (fragile, test thoroughly)
- `src/shared/db/app.types.ts` — Domain type definitions
- `src/features/tasks/components/TaskList.tsx` — Main project task view (project selection, tree, board UI)
- `src/features/tasks/hooks/useTaskMutations.ts` — Task CRUD with optimistic updates
- `src/features/tasks/hooks/useTaskQuery.ts` — Coordinates task + project queries
