# Agent Context & Codebase Map

> **For AI Agents**: Read this first to understand the system architecture,
> patterns, and where to find things. **TECH STACK ALERT**: JavaScript and JSX
> are entirely deprecated. TypeScript (.ts) and TSX (.tsx) are strictly enforced
> across the codebase. Runtime is Vite + React 18.3.1; do not introduce
> Create React App assumptions, `REACT_APP_*` env names, React 19-only APIs, or
> dependency upgrades that bypass `npm run verify-dependencies`.

## 1. Directory Structure (Feature-Sliced Variation)

- **`src/features/`**: Domain-specific logic (Business Logic).
  - Structure: `components/`, `hooks/`, `lib/`. *(Note: No barrel files like `index.ts` are used; import directly from the path).*
  - Key Domains: `projects`, `tasks`, `people`, `library`, `admin`.
- **`src/pages/`**: Top-level Route Views (Page Composition).
  - _Note_: Pages should primarily compose features, not contain deep logic.
- **`src/shared/`**: Universal utilities and UI (No Business Logic).
  - `ui/`: ShadCN/Radix primitives (Buttons, Inputs, Dialogs, `Popover`, and as of Wave 33 a `Tooltip` wrapper around `@radix-ui/react-tooltip` — app-shell `TooltipProvider` mounted in `src/app/App.tsx`).
  - `lib/`: Pure functions (`date-engine`, `tree-helpers`).
  - `api/`: API adapters (`planterClient`).
- **`docs/`**: Source of Truth.
  - `docs/architecture/*.md`: The definitive, modular Single Source of Truth for all domain business rules (Date Engine, RBAC, Tasks). **Always check here first before attempting architectural refactors.**
  - `docs/architecture/user-testing-baseline.md`: The active user-testing gap-closure baseline and ordered PR guardrails. Use it before dashboard, comments, template flags, clone/import, or date-engine tranche work.
  - `spec.md`: Product-scope specification and roadmap status.
  - `docs/testing/`: Testing strategy, historical coverage-gap findings, and implementation planning notes.
  - `supabase/migrations/20260426000000_baseline_schema.sql`: Current local Supabase baseline.
  - `docs/db/schema.sql`: Generated schema snapshot mirror.
  - `docs/db/README.md`: Current DB bootstrap contract. Local/CI DB validation uses `npm run db:local:bootstrap`, not raw `supabase start`.

## 2. Key Patterns

### Data Fetching

- **Primary**: `useQuery` and `useMutation` (TanStack React Query v5) via `planterClient`.
- **Adapter**: `src/shared/api/planterClient.ts` wraps Supabase SDK.
- **Rules**:
  - Do NOT use `supabase.from()` directly in UI components. Use `planterClient`
    or custom mutation hooks (e.g., `useTaskMutations`).
  - Always handle `loading` and `error` states.

### State Management

- **Server State**: React Query (Single Source of Truth).
- **Local State**: `useState` / `useReducer` for form/UI state.
- **Global UI State**: Context (`AuthContext`, Sonner Toasts).

### Styling

- **Engine**: TailwindCSS v4.
- **Components**: Radix UI primitives wrapped in `src/shared/ui/`.
- **Icons**: `lucide-react`.
- **Rules**: Avoid custom CSS files. Use utility classes and
  `class-variance-authority`.

## 3. Golden Paths (Critical Files)

- **Auth**: `src/pages/components/LoginForm.tsx` & `src/shared/contexts/AuthContext.tsx`
- **Primary Task Surface**: `/tasks` -> `src/pages/TasksPage.tsx`
- **Project Detail**: `src/pages/Project.tsx` -> `src/features/tasks/components/TaskList.tsx`
- **Task Details**: `src/features/tasks/components/TaskDetailsPanel.tsx`
- **Kanban Board V2 (Wave 20)**: `src/features/tasks/components/board/ProjectBoardView.tsx` → `BoardColumn.tsx` / `BoardTaskCard.tsx`. Native column-to-column drag-and-drop; `deriveUrgency` helper lives in `src/shared/lib/date-engine/index.ts`.
- **Task hierarchy depth (PR 4)**: supported depth is `project -> phase -> milestone -> task -> subtask`. `trg_enforce_task_hierarchy_depth` rejects direct DB/API/RPC inserts or reparenting that would put children below a subtask or move a parent under its own descendant; `derive_task_type` now emits `subtask` at the final level. UI helpers in `src/features/tasks/lib/task-hierarchy.ts` mirror the invariant for Project drag-and-drop and task child-action affordances.
- **Task List Views & Filters (Wave 20 + 33)**: `/tasks` → `src/pages/TasksPage.tsx` → `src/features/tasks/hooks/useTaskFilters.ts`. Filtered views: Priority, Overdue, Due Soon, Current, Not Yet Due, Completed, All, Milestones, My Tasks. "My Tasks" is scoped to the current user (`assignee_id === currentUserId`, plus unassigned legacy tasks where `creator === currentUserId`). Chronological/alphabetical sort. **Wave 33** unified this page with the deleted `/daily` view: due-date badges render right-aligned on each task row (`src/shared/lib/date-engine/formatTaskDueBadge.ts` — relative "Today"/"Tomorrow"/weekday/full-date + overdue/due-soon/neutral tone); a due-date range filter AND-combines with the status filter; task-row click opens the same `<TaskDetailsPanel>` the Project view uses; the task title is wrapped in a Radix tooltip revealing the parent project name. `/daily` is a Navigate-to-`/tasks` redirect.
- **Project Status Report (Wave 20)**: `/reports` → `src/pages/Reports.tsx` → `src/features/projects/hooks/useProjectReports.ts`. Month picker + lists of completed / overdue / upcoming milestones, donut charts.
- **Date Logic**: `src/shared/lib/date-engine/index.ts` (Handle with extreme care, heavily tested!). Direct `date-fns` imports stay constrained to this layer. App/edge `BusinessCalendar` seams live at `src/shared/lib/date-engine/business-calendar.ts` and `supabase/functions/_shared/business-calendar.ts`; `defaultBusinessCalendar` stays `calendar-day`, while `dateProjectBusinessCalendar` is `us-federal-observed` for date-kind schedule offsets, project shifts, urgency, and nightly due-soon cutoffs. `trg_enforce_task_date_envelope` rejects inverted ranges, dated children outside dated parents, incompatible reparenting, and parent shrink edits that would strand existing children. ICS all-day `DTEND` remains explicit calendar-day rendering.
- **Nightly CRON (Wave 20 + 21)**: `supabase/functions/nightly-sync/` (see its `README.md`) — owns urgency-status transitions (`not_started → in_progress → due_soon → overdue`) using per-project `settings.due_soon_threshold`; the due-soon cutoff helper lives in `supabase/functions/nightly-sync/urgency.ts` and routes date addition through the edge `dateProjectBusinessCalendar` while preserving the current UTC time-of-day. The app-layer Date Engine no longer writes status to the DB. **Wave 21 added a third pass**: fires matching `settings.recurrence` rules on template tasks and deep-clones them into their target project via `clone_project_template`. Idempotency stamp on the spawned root: `settings.spawnedFromTemplate` + `settings.spawnedOn` (UTC `YYYY-MM-DD`).
- **Recurring Tasks (Wave 21)**: Template-only recurrence rules at `tasks.settings.recurrence` — `{ kind: 'weekly', weekday: 0..6, targetProjectId }` or `{ kind: 'monthly', dayOfMonth: 1..28, targetProjectId }` (day-of-month capped at 28 to sidestep Feb/leap edges). UI: `src/features/tasks/components/RecurrencePicker.tsx` (rendered inside `TaskForm` only when `origin === 'template'`). Evaluator: `src/shared/lib/recurrence.ts` with a Deno mirror at `supabase/functions/_shared/recurrence.ts` — keep the two files in lock-step. Flat form fields are normalised to the nested JSONB shape via `src/features/tasks/lib/recurrence-form.ts` inside `TaskList`'s submit wrapper.
- **Supervisor Report (Wave 22, live via Resend)**: `supabase/functions/supervisor-report/` (see its `README.md`) — builds a monthly Project Status Report payload for every root task with `supervisor_email` set and POSTs it via `supabase/functions/_shared/email.ts` when `EMAIL_PROVIDER_API_KEY` and `RESEND_FROM_ADDRESS` are both set. Accepts an optional `{ project_id?, dry_run? }` JSON body (powers the "Send test report" button in `EditProjectModal`). Response includes a `dispatch_failures` counter. Degrades cleanly to log-only when the env vars are unset or `dry_run: true`. Keep the payload shape in sync with `src/features/projects/hooks/useProjectReports.ts`.
- **Library dedupe (Wave 22)**: `Task.clone` stamps `settings.spawnedFromTemplate` onto the cloned root (non-fatal, mirrors the nightly-sync recurrence convention). `useMasterLibrarySearch` accepts an `excludeTemplateIds` set and exposes an `exclusionDrained` flag so the combobox can branch its empty-state copy to "All matching templates are already in this project." `TaskList` and `pages/Project` derive the exclude set from their loaded project hierarchy (no extra round trip).
- **Coaching task tagging (Wave 22 + PR F + PR 3)**: tasks carry `settings.is_coaching_task: boolean`; authoring is template-only through `src/features/tasks/components/TaskFormFields.tsx` (`origin === 'template'`, template owner/editor/admin). `src/features/tasks/lib/task-form-flags.ts` strips hidden flag values from instance form submissions and only builds settings patches for template origin. `TaskDetailsView` still renders a read-only "Coaching" badge when an instance carries the inherited flag. DB: RLS policy `"Enable update for coaches on coaching tasks"` plus `trg_enforce_coach_task_update_scope` grants project coaches status/progress updates only on tagged instance rows; content, settings, assignment, priority, hierarchy, origin/template metadata, and deletes remain denied. The existing owner/editor/admin policy is untouched. UI capability gates live in `src/features/tasks/lib/task-permissions.ts`.
- **Coaching task auto-assignment (Wave 23 + PR G)**: BEFORE INSERT/UPDATE trigger `trg_set_coaching_assignee` on `public.tasks` (function `public.set_coaching_assignee`). When `settings.is_coaching_task = true` and `assignee_id IS NULL`, the trigger resolves the project from `NEW.root_id`, walks `parent_task_id` when a new child row is not root-stamped yet, then looks up `project_members WHERE role = 'coach'` and assigns if exactly one coach exists. Zero or multiple coaches → no-op; caller-supplied `assignee_id` is always respected. The UI picks up the server-assigned coach via `useUpdateTask` / `useCreateTask` `onSettled` cache invalidation of `['projectHierarchy', rootId]`. Migration: `docs/db/migrations/2026_04_17_coaching_auto_assign.sql`; PR G patched the helper to avoid unsupported `MIN(uuid)` during inherited coaching clones.
- **Comments (Wave 26)**: `TaskDetailsView.tsx` mounts `<TaskComments taskId>` only when its `showComments` prop is true. PR E disables that prop from `src/pages/Project.tsx`, so project-context task details hide comments while non-project callers can still render the comments surface. The comment stack remains
  `useTaskComments` (`['taskComments', taskId]`) + `useTaskCommentsRealtime`
  (channel `task_comments:task=:id`) → `planter.entities.TaskComment.{listByTask, create, updateBody, softDelete}`
  → `public.task_comments` (RLS by project membership). PR 7 routes comment reads through
  `public.list_task_comments_with_authors(p_task_id, p_comment_id)` so author hydration is a gated DB/RPC concern instead of a fragile cross-schema `author:users(...)` client select. Deleted users intentionally render as `author: null`. UI caps reply nesting at 1 level via chain-lift; DB allows arbitrary depth. Soft-delete clears body.
- **Activity Log (Wave 27)**: `entities.ActivityLog.{listByProject, listByEntity}` → `useProjectActivity` / `useTaskActivity` → `<ProjectActivityTab>` (project tab) + collapsed `<details>` rail in `TaskDetailsView`. Append-only via three SECURITY DEFINER triggers; comment-change trigger orders soft-delete BEFORE body-edit.
- **Realtime Presence (Wave 27 + Wave 36 remediation)**: per-project channel `presence:project:<id>` mounted by `useProjectPresence(projectId, focusedTaskId)` in `src/pages/Project.tsx`. `<PresenceBar>` in header and per-row focus chips on `TaskItem` share the same subscribed channel; focus tracking is debounced inside `useProjectPresence`.
- **Project Task Realtime**: `src/pages/Project.tsx` delegates task-table subscriptions to `src/features/projects/hooks/useProjectRealtime.ts`; keep project-detail invalidation behavior centralized there. The project-specific channel is scoped with `root_id=eq.<projectId>` and invalidates `['projectHierarchy', projectId]`, `['tasks', 'tree', projectId]`, and affected `['task', taskId]` queries; root-row updates also refresh `['projects']` and `['project', projectId]`. The page passes `enabled: !!projectId` so the empty project route does not open the hook's global channel. Task comments stay on their separate per-task channel via `useTaskCommentsRealtime`.
- **Gantt Chart (Wave 28)**: `/gantt?projectId=:id` (lazy-loaded route in `src/app/App.tsx`) → `src/pages/Gantt.tsx` → `<ProjectGantt>` (`src/features/gantt/components/`) backed by `gantt-task-react@0.3.9`. Adapter at `src/features/gantt/lib/gantt-adapter.ts`. Drag-to-shift goes through `useGanttDragShift` → `useUpdateTask` (cascades via Wave 18 `updateParentDates`). The toolbar's "Export PDF" action is launch-safe browser print (`window.print()` with accessible "Save as PDF" guidance), not a disabled/coming-soon control or a server-side PDF pipeline.
- **Checkpoint Project Kind (Wave 29)**: `settings.project_kind: 'date' | 'checkpoint'` on root tasks; helpers in `src/features/projects/lib/project-kind.ts` (`extractProjectKind` / `formDataToProjectKind` / `applyProjectKind`); `isCheckpointProject` in `@/shared/lib/date-engine` is lock-step with `supabase/functions/_shared/date.ts`. UI: `<RadioGroup>` in `EditProjectModal` with confirmation `<Dialog>` on the checkpoint → date revert; `PhaseCard` swaps its progress bar for a recharts `<PieChart>` donut. Nightly-sync urgency passes skip checkpoint roots via `loadRootInfo`.
- **Phase Lead (Wave 29)**: `settings.phase_lead_user_ids: string[]` on phase/milestone rows; `user_is_phase_lead(target_task_id, uid)` recursive ancestor-walk (STRICTLY excludes self — leads may edit tasks UNDER the phase/milestone but not the row itself) + additive RLS UPDATE policy. Multi-select picker in `TaskFormFields` (extracted `<PhaseLeadPicker>` sub-component, owner-only); purple badge in `TaskDetailsView`. Options filtered to viewer/limited members from `useTeam(projectId)`.
- **i18n Framework (Wave 31)**: `i18next` + `react-i18next` + `i18next-browser-languagedetector` stack. Provider tree wires `<I18nextProvider>` between `QueryClientProvider` and `AuthProvider` in `src/app/App.tsx`. Locale persisted to `localStorage.planterplan.locale`; detector falls back to `navigator.language`, then `'en'`. Locale switcher lives in `src/features/settings/components/LocaleSwitcher.tsx`, mounted in Settings → Profile. Display-time formatters (`formatDateLocalized`, `formatNumberLocalized`, `formatCurrencyLocalized`) in `src/shared/i18n/formatters.ts` (Intl-based, per-locale format caches). Internal date math remains UTC-anchored ISO in `src/shared/lib/date-engine` — **don't conflate display with math**. TypeScript module augmentation (`src/shared/i18n/i18n.d.ts`) types `t('key.path')` against `en.json`. Locale catalog: `en` (hand-authored baseline), `es` (machine-translated; human review pending — `_meta.review_required_before_marketing: true`). SSoT: `docs/architecture/i18n.md`. **Wave 31 scope expansion**: React downgraded from 19 → 18.3.1 (exact pin) to unblock Vercel preview deploys; audit confirmed no React-19-only APIs in use.
- **Template Hardening (Wave 36 + PR 2)**: `public.tasks.template_version int NOT NULL DEFAULT 1` — bumped on template edits by `trg_bump_template_version`; cloned roots carry `settings.cloned_from_template_version` stamped inside `clone_project_template`. `public.tasks.cloned_from_task_id uuid` is stamped server-side during `clone_project_template` for every cloned descendant. `trg_enforce_template_scaffold_immutability` blocks app-role deletes and structural/content/protected-template-settings updates on cloned instance scaffold rows while allowing workflow-state updates and runtime project configuration such as supervisor report delivery; postgres/service-role bypass is explicit for audited maintenance. `TaskDetailsView` delete guard mirrors the DB rule for all template-origin tasks. `TaskItem` "T" badge with "From template" tooltip. `/admin/templates` surfaces version drift (stale badge when an instance's stamp is behind the template's current version). SSoT: `docs/architecture/library-templates.md` + `docs/architecture/projects-phases.md`.
- **ICS Calendar Feeds (Wave 35 + PR 6 hardening)**: `public.ics_feed_tokens` + `supabase/functions/ics-feed/` (public endpoint, `text/calendar`). Client generates 256-bit opaque tokens with Web Crypto (`crypto.getRandomValues`, 32 bytes). `planter.integrations.{listIcsFeedTokens, createIcsFeedToken, revokeIcsFeedToken}`. `trg_enforce_ics_feed_token_update_scope` keeps user token lifecycle one-way: create new, soft-revoke old, no in-place credential retargeting/reactivation/hard delete. The edge feed intersects assigned tasks with current `project_members` scope before applying optional `project_filter`. ICS all-day `DTEND` date addition uses the edge `calendarDayBusinessCalendar` compatibility path because RFC 5545 `DTEND` is exclusive calendar rendering, not project scheduling. UI in `src/features/settings/components/IcsFeedsCard.tsx`, mounted in the new Settings → Integrations tab. SSoT: `docs/architecture/integrations.md`.
- **Admin Surface (Wave 34 + Wave 36 remediation + PR 8 verification)**: `/admin` → `<AdminLayout>` (lazy-loaded, `useIsAdmin()`-gated, non-admins toasted + redirected to `/tasks`). Nested routes: `/admin` (AdminHome — global search + cross-project recent activity), `/admin/users/:uid?` (AdminUsers — filterable table + detail aside), `/admin/analytics` (AdminAnalytics — recharts-backed snapshot), `/admin/templates` (template roots + clone drift). SECURITY DEFINER RPCs back reads (`admin_search_users`, `admin_user_detail`, `admin_recent_activity`, `admin_list_users`, `admin_analytics_snapshot`, `admin_search_root_tasks`, `admin_template_roots`, `admin_template_clones`) and platform-admin role toggles (`admin_set_user_admin_role`) via `planter.admin.*`; admin pages do not fetch all tasks client-side. Suspend/unsuspend/reset-password route through `supabase/functions/admin-user-moderation/`, which authorizes the caller with the user JWT, checks `is_admin`, then escalates with the service-role client only inside the Edge Function. Reset links are credential-equivalent in the UI: they are copied to clipboard when possible and otherwise revealed only inside a masked dialog, never in toast descriptions. `useIsAdmin` reads the already-hydrated `user.role === 'admin'` — no per-render round-trip. Admin notifications on new project: `trg_notify_admin_on_new_project` AFTER INSERT trigger enqueues into the Wave 30 `notification_log` pipeline (respects admin opt-out + quiet hours).
- **Notifications Stack (Wave 30)**: Three tables (`notification_preferences`, `notification_log`, `push_subscriptions`) + four edge functions (`dispatch-push`, `dispatch-notifications`, `overdue-digest`, plus the existing `supervisor-report`) form the end-to-end push + email pipeline. Mention path: `CommentComposer` calls `extractMentions` → `resolveMentions` (RPC `resolve_user_handles` maps handles → uuids; failures warn and return no mentions) → persist to `task_comments.mentions`; `trg_enqueue_comment_mentions` AFTER INSERT enqueues project-member-scoped `mention_pending` rows with recipient, actor, comment, task, and project metadata; per-minute `dispatch-notifications` drains via single-runner-wins state machine (`_pending → _processing → _sent | _failed | _skipped`), honoring quiet hours and per-event email/push prefs. Daily `overdue-digest` emails assigned-overdue rollups with user-tz Monday filter for weekly cadence. Settings → Notifications tab exposes all prefs. SSoT: `docs/architecture/notifications.md`. Cron schedules: `docs/operations/edge-function-schedules.md` (pg_cron intentionally NOT enabled). Service worker `public/sw.js` is a documented JS exception — TS conversion is not currently scheduled (the PWA/workbox track that would have subsumed this file was descoped during the post-Wave-31 roadmap renumber).
- **Resource Library**: `src/features/projects/components/ResourceLibrary.tsx` +
  `src/features/projects/hooks/useProjectResources.ts` — project-scoped resource browser tab (search + type filter). Data fetched via `planterClient.entities.TaskResource.listByProject(projectId)`, which uses a Supabase `!inner` join on `tasks.root_id`. Returns `ResourceWithTask[]` (defined in `src/shared/db/app.types.ts`).
- **Project Settings Modal**: `src/features/projects/components/EditProjectModal.tsx` — edits title, description, start date, due date, and `due_soon_threshold` (stored in `tasks.settings` JSONB). The `location` field has been deprecated and removed from the UI. Archive / Unarchive is a visibility-only action exposed through `useSetProjectArchived`; lifecycle display derives from child task state.
- **Project Switcher (Wave 21.5 + 25)**: `src/features/projects/components/ProjectSwitcher.tsx` — header-level Shadcn `DropdownMenu` listing active projects (`status !== 'archived' && !is_complete`). Two independent toggles now reveal inactive subsets inline: "Show archived" (Wave 21.5, `status === 'archived'`) and "Show completed" (Wave 25, `status !== 'archived' && is_complete === true`). Rows that are both archived and completed classify as archived and appear only behind the archived toggle. Selection routes to `/project/:id` via `useNavigate`. Reads its data via `useTaskQuery` to stay inside FSD boundaries.
- **Task Details Pane (Wave 21.5)**: `src/features/tasks/components/TaskDetailsView.tsx` now surfaces a "Related Tasks" section between Dependencies and Subtasks (siblings fetched via `useTaskSiblings` → `planter.entities.Task.listSiblings`, excludes current task, ordered by `position`). The prior bare `mailto:` button is replaced with an "Email details" Dialog (`react-hook-form` + zod, readonly body built with `formatDisplayDate`); recipients persist on `user_metadata.saved_email_addresses` via `AuthContext.rememberEmailAddress`.
- **Settings Page**: `src/pages/Settings.tsx` + `src/features/settings/hooks/useSettings.ts` — Profile tab (name, avatar, role, org, email prefs), Notifications, Integrations/ICS feeds, and Security tab (password change). Active-session password change calls `planter.auth.changePassword(currentPassword, newPassword)` after requiring the current password; email-link recovery uses `/reset-password`.

## 3a. Key Behavioral Contracts (Wave 18)

### Milestone / Phase Auto-Completion (§3.3)
`planterClient.entities.Task.updateStatus(taskId, 'completed')` now:
1. **Cascades DOWN**: marks all descendant tasks as `completed` (recursive, batched in groups of 3 via `Promise.all`).
2. **Bubbles UP via `reconcileAncestors(parentId, depth, maxDepth)`**: after the cascade, checks whether all siblings of `taskId` are `completed`. If so, marks the parent (`is_complete: true, status: 'completed'`). If not, derives the parent's status via `deriveParentStatus(children)` (priority order: `blocked` > `in_progress` > `overdue` > `todo`) and sets `is_complete: false`. Normal task/milestone updates preserve the existing two-ancestor cap; subtask updates get one extra ancestor so Task -> Milestone -> Phase reopens cannot leave the phase stale. This is the app-level equivalent of the DB `check_phase_unlock` trigger.
3. **Re-open behavior**: when a task moves OUT of `completed` (e.g., checkbox unchecked), `reconcileAncestors` is still called. Any ancestor that previously auto-completed is automatically un-completed with a derived status (`is_complete: false`, status = `deriveParentStatus`). This prevents stale "completed" parents when a child is re-opened.

`useUpdateTask` routes **status-only** mutations through `updateStatus` (vs. the raw `Task.update`) so every checkbox toggle in the UI fires the full cascade/bubble pipeline. Mixed-field updates (e.g., form saves that include status + title) bypass this path and use the generic update.

**Completion-flag invariant (Wave 23):** `is_complete === (status === 'completed')` is enforced *unconditionally* at the DB layer by the `sync_task_completion_flags` BEFORE INSERT/UPDATE trigger on `public.tasks` (migration: `docs/db/migrations/2026_04_17_sync_task_completion.sql`). **`status` is the source of truth** — any dual-field write with inconsistent values is reconciled to match `status`, not accepted verbatim. Accordingly, `updateStatus` and `reconcileAncestors` now send **only** `status` on every server payload; `is_complete` is derived by the trigger. React Query optimistic caches still hold both fields locally because the UI reads both — the trim is server-facing only.

### Date Bubble-up (§3.3)
`planterClient.entities.Task.updateParentDates(parentId)` is now called automatically:
- **After task create** — always, when the new task has a parent.
- **After task edit** — when `start_date` or `due_date` is part of the update payload.
- **After task delete** — always, when the deleted task had a parent (parent ID captured from React Query cache in `onMutate` before optimistic removal).

This is wired in `src/features/tasks/hooks/useTaskMutations.ts` (`useCreateTask`, `useUpdateTask`, `useDeleteTask` `onSettled` callbacks).

## 4. Testing & Verification

- **Unit/Integration**: `npm test` (Vitest).
- **Release E2E Smoke**: `npm run test:e2e:release` (Playwright BDD `@release` scenarios; required in CI).
- **Full E2E Suite**: `npm run test:e2e` (legacy Playwright BDD suite in `Testing/e2e/features/`; run manually when changing broad E2E coverage, but do not treat it as the current release gate without first seeding/curating stale scenarios).
- **Linting**: `npm run lint` (Zero-tolerance for errors, including `noUnusedLocals`).

## 5. Deployment / Build

- **Build**: `npm run build` (tsc -b && vite build).
- **Dependency guardrails**: `npm run verify-dependencies` enforces exact
  runtime pins for `react`, `react-dom`, and `react-is` at `18.3.1`, exact
  `gantt-task-react@0.3.9`, React 18 type packages, and the currently
  supported dnd-kit majors. React 19, dnd-kit major changes, or gantt upgrades
  require a dedicated dependency PR.
- **Environment**: Local Supabase (`127.0.0.1:54321`) mimics Sync/Realtime. Required Vite client env keys are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; missing keys render the boot-safe configuration error from `BootConfigGate` instead of throwing during `src/shared/db/client.ts` import. The error surface lists variable names only and never prints env values.

## 6. Ignorable Files (Context Noise)

The following files are generated or tracked for AI context but are not critical
for a human code review. They can be safely ignored to save focus:

- **`.ai-ignore/docs/FULL_ARCHITECTURE.md`**: Monolithic legacy architecture file. Replaced completely by `docs/architecture/`.
- **`docs/db/drafts/*`**: Work-in-progress SQL scripts.
- **`.antigravity/*`**: AI Agent configuration, rules, and workflows.
- **`archive/*`**: Old code and documentation.
- **`supabase/seeds/*`**: Large seed files (unless modifying data
  initialization).
