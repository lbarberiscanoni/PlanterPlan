# PlanterPlan Engineering Log & Roadmap

**Current Status:** Spec v1.20.0 | 864 tests passing | 0 lint errors | Vercel preview green | **All scoped waves shipped — v1.0.0 pending ultrareview.** 
**Last Finalized:** Wave 36 on 2026-04-22 
**Target:** v1.0.0 release after the single-branch megabatch is merged to main.

---

## Edit Contract (read before modifying this file)

This file is maintained by **PROMPT B** in `.claude/wave-recurring-prompts.md`. Per-task PRs do **not** edit it; the finalize session does. Rules:

* **Part I (historical ledger) is immutable.** Pre-Wave-26 waves are closed books — do not retouch unless correcting a factual error.
* **Part II → Shipped table**: on each finalize, move the completed wave's row from the Remaining Roadmap into Shipped. Fill `Spec` (post-wave spec version), `Tests` (post-wave `npm test` count), and a one-line Core Components summary. Keep the summary under ~240 characters; deep detail belongs in `repo-context.yaml` `wave_N_highlights:` and the relevant `docs/architecture/*.md`.
* **Remaining Roadmap**: tick `[ ]` → `[x]` as PRs merge during per-task execution. Wave-level completion (moving the whole row to Shipped) happens only at finalize.
* **Current Status header**: refresh all three fields on every finalize. `Last Finalized` records today's date + the new `main` HEAD after the pointer-advance commit.
* **Deferred work ledger** at the bottom: append, don't rewrite. Close out items by striking through the row and adding `Resolved in Wave N`.
* **No commit SHAs in Part II.** Part I has them only because its planning-commit era has no corresponding wave row. Post-Wave-26 work is traceable through merge commits in git log.

---

## Part I — Pre-Wave-26 Historical Ledger

*Stabilization and feature-completion push from commit `74fe4ef` forward, prior to the current delivery loop.*

### Phase 1: Stabilization (Waves 15–16)

| Wave | Focus | Key Deliverables |
| :--- | :--- | :--- |
| **15 / 15.1** | Architecture & refactoring | Enforced barrel exports → later removed per ADR-8; excised Dark Mode suite; 92 lint errors → 2; FSD boundaries via `shared/constants` extraction; date math consolidated in `date-engine` (ADR-9); `planterClient.js` → `planterClient.ts`. |
| **16** | Code health & UI polish | Zero `tsc` errors globally; dead-code deletion across Auth, Onboarding, Reports; UI corruption repairs in Dashboard/Reports; clean-lint campaign (58+17+56 errors resolved); Single Light Theme enforced. |

### Phase 2: Feature Completion (Waves 17–21.5)

| Wave | Focus | Key Deliverables |
| :--- | :--- | :--- |
| **17** | Core expansion | Completed Project Settings (§3.2) and Resource Library (§3.4). |
| **18** | Automations & auth | Milestone/Phase auto-completion (cascade DOWN + bubble UP via `reconcileAncestors`, depth-capped at 1, re-open behavior handled); date bubble-up wired into `useCreateTask`/`useUpdateTask`/`useDeleteTask` `onSettled`; Account Management (password change + Security tab). |
| **19** | UI/UX refinement | Cleanup pass on date-engine, templates, dashboard, library, tests. Date-shift toast, progress donut, template publishing. |
| **20** | Views & reporting | Kanban Board V2 with native column DnD; Task List Views & Filters at `/tasks` (Priority/Overdue/Due Soon/Current/Not Yet Due/Completed/All/Milestones/My Tasks); Project Status Report at `/reports`; nightly CRON urgency transitions. |
| **21** | Recurrence & comms | Recurring tasks via `settings.recurrence` with `spawnedFromTemplate`+`spawnedOn` idempotency; supervisor email on root task; `supervisor-report` edge function (log-only initial ship). |
| **21.5** | Archiving & context | Secondary Projects archive/unarchive toggle; ProjectSidebar/Switcher "Show archived" filter; Task Detail Related Tasks section (`useTaskSiblings`); Email details dialog with recipients persisted on `user_metadata.saved_email_addresses`. |

### Phase 3: Hardening (Waves 22–25)

| Wave | Focus | Key Deliverables |
| :--- | :--- | :--- |
| **22** | Comms & templates | `supervisor-report` Resend dispatch (env-gated); `Task.clone` stamps `settings.spawnedFromTemplate`; Master Library combobox hides already-cloned templates; `settings.is_coaching_task` + coaching RLS UPDATE policy; `planterClient.functions.invoke()` passthrough. |
| **23** | Triggers & rules | Coaching-task auto-assignment trigger (`set_coaching_assignee`, sole-coach heuristic); `check_project_ownership` → `check_project_creatorship` audit (shim preserved for Wave 24 rewrite window); `sync_task_completion_flags` trigger enforces `is_complete === (status === 'completed')` unconditionally. |
| **24** | RLS rewrite | `project_members` RLS rewrite per Wave 23 audit (creatorship branch dropped from SELECT; INSERT uses creatorship; UPDATE/DELETE use new `check_project_ownership_by_role`); shim dropped. Strategy-template task type (`settings.is_strategy_template`) prompts library follow-ups on completion. Coaching-task assignee backfill on membership changes. |
| **25** | Discriminators & UI | Topically related Master Library templates (`useRelatedTemplates`) in Strategy follow-up flow; `tasks.task_type` discriminator column (`'project' \| 'phase' \| 'milestone' \| 'task' \| 'subtask'`) via `derive_task_type` + `trg_set_task_type` + backfill (additive); "Show completed" toggle on ProjectSwitcher. |

### Phase 4: Planning & Infrastructure (Pre-Wave-26 Cutover)

Delivery scaffolding established for Waves 26–38:

* `6a1691b` — Wave 26–38 plans authored (Collaboration → 1.0.0 release readiness).
* `5d5fb43` — Plans hardened against codebase verification + Sonnet-4.6 execution guardrails.
* `afa567c` — `.claude/wave-testing-strategy.md` + per-wave test-impact cross-refs.
* `ee0de76` — `.claude/wave-execution-protocol.md` with explicit HALT gates per wave.
* `fc087c9` — `.claude/wave-recurring-prompts.md` with self-advancing pointer.
* `13f19f6` — jsdom 29 `localStorage` mock fix (test-baseline unblock).
* `b65b14a` — `isTodayDate` timezone-safe for `YYYY-MM-DD`.
* `3ae00ff` — `react-is@^19` peer dep added for `recharts@3.8` (later superseded by Wave 31 React 18 rollback).
* `1561861` — lint ignore of generated dirs + stale-disable purge.

---

## Part II — Wave Delivery Status (current loop)

### ✅ Shipped (Waves 26–31)

| Wave | Theme | Spec | Tests | Core Components Delivered |
| :--- | :--- | :--- | :--- | :--- |
| **26** | Task Comments | 1.11.0 | 641 | `task_comments` table with self-FK threading + 4 RLS policies + realtime publication; `planterClient.entities.TaskComment` (`listByTask`/`create`/`updateBody`/`softDelete`); `useTaskComments(Realtime)` hooks; `CommentComposer` with client-side mention extraction (`extractMentions`); UI caps reply nesting at 1 via chain-lift. SSoT: `docs/architecture/tasks-subtasks.md`. |
| **27** | Activity Log + Presence | 1.12.0 | 660 | `activity_log` append-only table + 3 SECURITY DEFINER triggers (`log_task_change`/`log_comment_change`/`log_member_change`; soft-delete ordered before body-edit detection); `<ProjectActivityTab>` + `<ActivityRow>` + per-task rail; `useProjectPresence` realtime channel + `useTaskFocusBroadcast` (250ms debounce) → per-row focus chips. |
| **28** | Gantt Chart | 1.13.0 | 667 | Lazy-loaded `/gantt?projectId=:id` route; `gantt-task-react@0.3.9` (exact pin); `gantt-adapter` (phase→milestone→leaf walker with ancestor fallback + skippedCount); `useGanttDragShift` routed through `useUpdateTask` with parent-bounds validation. |
| **29** | Project Kind + Phase Leads | 1.14.0 | 718 | `settings.project_kind: 'date' \| 'checkpoint'` discriminator on root tasks (additive CHECK); `recalculateProjectDates` + `deriveUrgencyForProject` short-circuit on checkpoint; `PhaseCard` donut swap. `settings.phase_lead_user_ids[]` on phase/milestone rows + `user_is_phase_lead` SECURITY DEFINER (parent-of-target CTE) + additive RLS UPDATE policy. |
| **30** | Push + Email Notifications | 1.15.0 | 771 | Three tables (`notification_preferences`, `notification_log`, `push_subscriptions`); four edge functions (`dispatch-push`, `dispatch-notifications`, `overdue-digest`, pre-existing `supervisor-report`); single-runner-wins mention state machine (`_pending → _processing → _sent \| _failed \| _skipped`); VAPID web push; quiet hours; tz-aware Monday weekly digest; external scheduling (`pg_cron` intentionally disabled); `.npmrc legacy-peer-deps=true` unblocked Vercel previews. SSoT: `docs/architecture/notifications.md`. |
| **31** | Localization *(+ scope expansion: React 18 rollback)* | 1.16.0 | 791 | `i18next@^23.16.8` + `react-i18next@^15.7.4` + `i18next-browser-languagedetector@^8.2.1`; `en.json` (230 keys / 11 namespaces, hand-authored) + `es.json` (machine-translated, `_meta.review_required_before_marketing: true`); Intl formatters (`formatDateLocalized`/`formatNumberLocalized`/`formatCurrencyLocalized`) with per-locale cache; TypeScript module augmentation types `t('key.path')`; `LocaleSwitcher` in Settings → Profile; `renderWithProviders` test helper. **Scope expansion**: React `19.2.5` → exact `18.3.1` (no React-19-only APIs in tree); audit + rollback unblocked Vercel preview deploys. SSoT: `docs/architecture/i18n.md`. |
| **32** | UX Bug Fixes | 1.16.2 | 797 | `useTaskFilters` milestone predicate rewired to the Wave 25 `task_type === 'milestone'` discriminator (dead `buildMilestoneIdSet` removed); status predicates reconciled to the Wave 23 canonical set. Dashboard header grew a `variant="secondary"` New Template button alongside New Project, wired to the already-mounted `CreateTemplateModal` via `actions.setShowTemplateModal(true)`. New `dashboard.new_template` i18n key in `en.json` + `es.json`. Pre-flight dropped the originally-scoped project due-date cache-invalidation task (already shipped in Wave 15 at `c88b3e7`). |
| **33** | Unified Tasks View | 1.17.0 | 827 | Shadcn `<Tooltip>` wrapper around `@radix-ui/react-tooltip@^1.2.8`, app-shell `<TooltipProvider delayDuration={300}>`. `formatTaskDueBadge` helper (`src/shared/lib/date-engine/`) produces `{label, kind, tone}` with today/tomorrow/weekday/full-date + overdue/due_soon/neutral tones — no raw date math. `TaskItem` renders the badge right-aligned and wraps the title in a Tooltip revealing the parent project name when threaded. `useTaskFilters` grew a `DueDateRange` predicate (AND with status filters). `TasksPage` surfaces two inline `<input type="date">` + clear button, mounts `<TaskDetailsPanel>` on row click, builds rootId→title map for the tooltip prop. `/daily` deleted (`<Navigate to="/tasks" replace />` redirect); daily E2E page object + feature + step file purged. New i18n keys under `tasks.filters.dateRange` + `tasks.dueBadge`. Dev dep `@testing-library/user-event@^14.6.1`. |
| **34** | Advanced Admin Management | 1.18.0 | 842 | Lazy-loaded `/admin` shell (`<AdminLayout>` hard-gated via `useIsAdmin()`; non-admins toasted + Navigate to `/dashboard`). Nested routes: `/admin` (Home + cross-project activity), `/admin/users/:uid?` (filtered table + detail aside), `/admin/analytics` (recharts snapshot dashboard). Five SECURITY DEFINER RPCs (`admin_search_users`, `admin_user_detail`, `admin_recent_activity`, `admin_list_users`, `admin_analytics_snapshot`) gate every read through `public.is_admin(auth.uid())` — non-admin callers raise `unauthorized`. `trg_notify_admin_on_new_project` AFTER INSERT trigger enqueues `admin_new_project_pending` rows into the Wave 30 notification pipeline (closes Wave 30 deferral). `useIsAdmin` / `useAdminUsers` / `useAdminUserDetail` / `useAdminAnalytics` hooks under `src/features/admin/`. planterClient grew `admin.*` namespace. Zero new deps (recharts + cmdk were already in the bundle). |
| **35** | ICS Calendar Feeds | 1.19.0 | 859 | `public.ics_feed_tokens` (migration `docs/db/migrations/2026_04_18_ics_tokens.sql`) with opaque-token auth + soft revocation. `supabase/functions/ics-feed/` public edge function returns `text/calendar` (RFC 5545 VCALENDAR with all-day VEVENTs + 24h VALARM, escape + fold helpers in `ics.ts`). Client generates 256-bit tokens via `crypto.randomUUID()` × 2. `planter.integrations.{list,create,revoke}IcsFeedToken`. Settings → Integrations tab (`IcsFeedsCard`) surfaces create / copy-URL / revoke. SSoT: `docs/architecture/integrations.md`. |
| **36** | Template Hardening | 1.20.0 | 864 | Two architecture-doc known-gaps closed. `template_version int NOT NULL DEFAULT 1` on `public.tasks` + BEFORE UPDATE trigger `trg_bump_template_version` (migration `docs/db/migrations/2026_04_18_template_versioning.sql`). `Task.clone` looks up + stamps `settings.cloned_from_template_version` on clone roots. `cloned_from_task_id uuid ON DELETE SET NULL` column (migration `docs/db/migrations/2026_04_18_task_template_origin.sql`) — server-side stamp during `clone_project_template`; `TaskDetailsView` delete guard blocks non-owners from deleting template-origin tasks (owner-bypass). `TaskItem` renders a "T" badge with a "From template" tooltip. New `/admin/templates` surface shows version drift with a "stale" badge. |

### 🟡 Remaining Roadmap

*No waves remaining. All scoped Waves 32 → 36 shipped on the single-branch megabatch. The original plan's Waves 32 (PWA + Offline), 34 (White Labeling), 35 (Stripe Monetization + Licensing), and 38 (Release Cutover) remain descoped.*

---

## Part III — Deferred Work Ledger

Items explicitly kicked out of a shipped wave. Close out by striking through + marking "Resolved in Wave N".

| Logged In | Item | Target / Status |
| :--- | :--- | :--- |
| Wave 30 | Admin notifications on new project creation | Wave 34 Task 3 |
| Wave 30 | `public/sw.js` JS exception (push-only worker) | Open — no wave assigned (original Wave 32 PWA/workbox work descoped during the post-31 renumber) |
| Wave 31 | Human-review pass on `es.json` before any "Spanish support" marketing claim | Open — no wave assigned |
| Wave 31 | ~~Remaining string-extraction surfaces: `TaskDetailsView` family, full `AddPersonModal`, deep library views, activity-log humanizers, `<Home>` marketing copy~~ | Resolved in Wave 36 remediation |
| Wave 31 | `eslint-plugin-i18next no-literal-string` rule enablement | Removed from product scope for this remediation; en/es parity tests remain the active guardrail |
| Wave 31 | React 19 re-adoption | Not on near-term roadmap (18.3.1 stable; no behavioral regressions) |
| Wave 30 | Four `react-hooks/set-state-in-effect` suppressions in `useTreeState`, `PeopleList`, `useSettings` | Open — future cleanup wave |

---

## Part IV — Cross-Reference Index

* **Per-wave authoritative plan**: `.claude/wave-N-prompt.md`
* **Execution protocol (HALT gates)**: `.claude/wave-execution-protocol.md`
* **Test-impact strategy per wave**: `.claude/wave-testing-strategy.md`
* **Recurring delivery prompt (pointer + PROMPT A/B)**: `.claude/wave-recurring-prompts.md`
* **Spec (user-facing functional requirements)**: `spec.md`
* **Domain SSoT (business rules, state machines)**: `docs/architecture/*.md`
* **Codebase map + golden paths**: `docs/AGENT_CONTEXT.md`
* **Technical debt + active deferrals**: `docs/dev-notes.md`
* **Wave-status machine-readable snapshot**: `repo-context.yaml` (`wave_status:` + `wave_N_highlights:`)
