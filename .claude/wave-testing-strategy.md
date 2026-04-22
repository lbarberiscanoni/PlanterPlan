# Waves 26–37 Testing Strategy

> **Roadmap note**: the pre-renumber plan's Waves 32 (PWA + Offline), 34 (White Labeling), 35 (Stripe Monetization + Licensing), and 38 (Release Cutover) were descoped, and wave numbers were reassigned sequentially after Wave 31. The active roadmap is: Wave 32 (UX bug fixes) → Wave 33 (unified Tasks view) → Wave 34 (Advanced Admin Management) → Wave 35 (ICS feeds) → Wave 36 (template hardening). Historical references to the removed waves have been stripped from this doc.


**Audience**: any agent (Sonnet 4.6, Opus 4.7, future) executing the wave plans.

**Purpose**: this doc complements the per-wave prompt files in `.claude/wave-N-prompt.md`. Each wave plan lists the NEW tests to add. This doc covers what's invisible from a single wave plan: which **existing** tests will break, what **shared** test infrastructure needs to be created early so later waves can reuse it, and how the **E2E persona/seed** layer needs to evolve.

Read this doc once at the start of every wave. Reference its tables when planning each task's test work.

---

## 1. Existing test infrastructure (recap)

Full inventory in the agent-explored map. Quick-reference:

| Layer | Path | Notes |
| --- | --- | --- |
| Unit runner | `vite.config.ts` `test:` block + `Testing/setupTests.ts` | Vitest, jsdom env, `globals: true`, `include: 'Testing/unit/**/*.test.{ts,tsx}'` |
| Setup file | `Testing/setupTests.ts` | Imports `@testing-library/jest-dom`; mocks `window.matchMedia` |
| Factories | `Testing/test-utils/factories.ts` | `makeTask`, `makeProject`, `makeTaskChain`, `makeSiblingTasks`, `makeTeamMember` (re-exported via `Testing/test-utils/index.ts`) |
| Render wrapper | `Testing/test-utils/query-wrapper.tsx` | `createTestQueryClient()`, `renderWithQueryClient(ui, options)` |
| Supabase mock | per-test `vi.mock('@/shared/db/client', ...)` + `createChain()` helper inline (see `planterClient.test.ts`) | Chainable query builder pattern; `chain.then = (resolve) => resolve(resolvedValue)` |
| planterClient mock | per-test `vi.mock('@/shared/api/planterClient', () => ({ planter: { entities: {...} }}))` | Entity-method mocks via `vi.fn()` |
| AuthContext mock | per-test `vi.mock('@/shared/contexts/AuthContext', ...)` | Returns `{ user, loading, signUp, signIn, signOut, updateMe, ... }` |
| E2E runner | `Testing/e2e/playwright.config.ts` | Playwright BDD; projects: `chromium`, `mobile-chrome`, `accessibility`; depends on `setup` for auth state hydration |
| E2E global setup | `Testing/e2e/global-setup.ts` | Logs in 6 personas, saves `storageState` to `e2e/.auth/<role>.json` |
| Personas | `e2e/.auth/owner.json`, `editor.json`, `viewer.json`, `limited.json`, `coach.json`, `user.json` | Tests pick role via `testAsRole(role)` from `Testing/e2e/fixtures/auth.fixture.ts` |
| Seed | `scripts/seed-e2e.js` | Frontend-only against live Supabase — no local DB |
| Page Objects | `Testing/e2e/fixtures/base.fixture.ts` | 8 POMs: login, dashboard, project, tasks, daily, reports, settings, team |

**Test counts at start of Wave 26**: 50 unit test files, 319 E2E scenarios, 21 step files, 2,765 LOC of step code. Wave 26 inherits these and grows them.

**Critical fact**: unit tests do NOT hit a real database. All Supabase access is mocked. **DB triggers do not fire in unit tests** — they only matter for E2E and manual smoke. This is essential for understanding which waves "break" which tests.

---

## 2. Shared test-infrastructure additions (build these EARLY)

These should be created during the FIRST wave that needs them, then reused. Listed here so later waves don't reinvent.

### 2.1 Setup file extensions (`Testing/setupTests.ts`)

Add these globals as their owning waves arrive. **Do not add them all at once** — each lands in the wave that introduces the API need.

| Wave | Addition | Why |
| --- | --- | --- |
| 26 | `globalThis.crypto.randomUUID` polyfill if not present in jsdom | `useTaskComments` optimistic insert uses temp uuid |
| 30 | Mock `navigator.serviceWorker` (returns object with `register`, `ready`, `getRegistration`) and `Notification` (with `requestPermission` + static `permission` getter) | `usePushSubscription` reads both at module load |
| 31 | Initialize i18next with the test resources (in-memory) and wrap `renderWithQueryClient` to include `<I18nextProvider>` | Component tests need `t()` to resolve; otherwise they render the i18n key as the literal string |

### 2.2 Factory additions (`Testing/test-utils/factories.ts`)

Mirror the existing `makeTask` / `makeProject` style: faker defaults + `overrides?` parameter.

| Wave | Factory | Returns |
| --- | --- | --- |
| 26 | `makeComment(overrides?)` | `TaskCommentRow` with sensible defaults (`body`, `mentions: []`, `deleted_at: null`, ISO `created_at` etc.) |
| 26 | `makeCommentWithAuthor(overrides?)` | `TaskCommentWithAuthor` (Comment + nested `author: { id, email, user_metadata }`) |
| 27 | `makeActivityLogRow(overrides?)` | `ActivityLogRow` with default `entity_type: 'task'`, `action: 'created'` |
| 27 | `makeActivityLogWithActor(overrides?)` | Activity row + nested actor profile |
| 27 | `makePresenceState(overrides?)` | `{ user_id, email, joinedAt: Date.now(), focusedTaskId: null }` |
| 28 | `makeGanttRow(overrides?)` | `gantt-task-react` `Task` shape (id, name, type, start, end, progress) |
| 30 | `makeNotificationPref(overrides?)` | `NotificationPreferencesRow` with all booleans true and `email_overdue_digest: 'daily'` |
| 30 | `makeNotificationLogRow(overrides?)` | `NotificationLogRow` with default `event_type: 'mention_pending'` |
| 30 | `makePushSubscription(overrides?)` | `{ endpoint, p256dh, auth, user_agent }` + DB row variant |
| 34 | `makeAdminUser(overrides?)` | Mirror `makeTeamMember` for admin tests |
| 35 | `makeIcsFeedToken(overrides?)` | Wave 35 ICS token row |

Re-export each from `Testing/test-utils/index.ts` so callers `import { makeComment } from '@test/factories'`.

### 2.3 Render-wrapper extensions (`Testing/test-utils/query-wrapper.tsx`)

Today: `renderWithQueryClient(ui, options?)` wraps with `<QueryClientProvider>`.

Wave 31 shipped a richer helper alongside (without replacing the existing):

```ts
// Testing/test-utils/render-with-providers.tsx (landed in Wave 31)
export function renderWithProviders(ui: ReactElement, options?: {
  queryClient?: QueryClient;
  authState?: Partial<AuthContextValue>;     // optional auth override
  locale?: 'en' | 'es';                       // Wave 31
  initialRoute?: string;                      // for tests that need <BrowserRouter>
}): RenderResult & { queryClient: QueryClient }
```

### 2.4 Cross-cutting mocks (`Testing/test-utils/mocks/`, NEW directory)

Land each as its owning wave arrives:

| Wave | File | Exports |
| --- | --- | --- |
| 26 | `Testing/test-utils/mocks/supabase-channel.ts` | `mockSupabaseChannel({ presenceState? })` — returns a chain mock for `supabase.channel(name).on(...).subscribe()`. Captures the `on('postgres_changes' | 'presence', ..., handler)` callback so tests can fire payloads via `channel.__fire('INSERT', payload)`. |
| 30 | `Testing/test-utils/mocks/service-worker.ts` | `installServiceWorkerMock()` — sets up `navigator.serviceWorker` with `register`, `ready`, `controller`, `getRegistration`. |
| 30 | `Testing/test-utils/mocks/notification-api.ts` | `installNotificationMock(initialPermission)` — globals for `Notification.permission`, `Notification.requestPermission()`, `PushManager`. |
| 31 | `Testing/test-utils/mocks/i18n.ts` | `mockUseTranslation()` — returns `{ t: (key) => key, i18n: { language: 'en', changeLanguage: vi.fn() } }`. Use ONLY in tests that don't need real i18n resolution (most tests should use the real provider via `renderWithProviders`). |

---

## 3. Per-wave test impact

For each wave: (a) **existing tests at risk** (will break or need extension), (b) **new tests to add** (already in the wave plan; restated as a checklist), (c) **new infrastructure** (factories, mocks, fixtures), (d) **E2E impact**.

---

### Wave 26 — Threaded Comments

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/tasks/components/TaskDetailsView.coachingBadge.test.tsx` | TaskDetailsView now mounts `<TaskComments>`. If the test renders the full component without mocking the comments hooks, the test will throw on missing `useTaskComments` data. | Add `vi.mock('@/features/tasks/hooks/useTaskComments', () => ({ useTaskComments: () => ({ data: [], isLoading: false }) }))` to each of the four `TaskDetailsView.*.test.tsx` files. Same for `useTaskCommentsRealtime` (no-op). |
| `Testing/unit/features/tasks/components/TaskDetailsView.email.test.tsx` | Same as above. | Same. |
| `Testing/unit/features/tasks/components/TaskDetailsView.related.test.tsx` | Same as above. | Same. |
| `Testing/unit/features/tasks/components/TaskForm.coaching.test.tsx` | Uses `TaskDetailsView` indirectly? Verify by reading the file. | If yes: same mitigation. If no: no change. |
| `Testing/unit/shared/api/planterClient.test.ts` | Adds new entity namespace `entities.TaskComment`. Existing tests don't use it. | No risk; just add new tests for the new namespace. |

**New tests (per Wave 26 plan):**
- [ ] `Testing/unit/shared/api/planterClient.taskComments.test.ts`
- [ ] `Testing/unit/features/tasks/lib/comment-mentions.test.ts`
- [ ] `Testing/unit/features/tasks/hooks/useTaskComments.test.tsx`
- [ ] `Testing/unit/features/tasks/hooks/useTaskCommentsRealtime.test.ts`
- [ ] `Testing/unit/features/tasks/components/TaskComments/TaskComments.test.tsx`

**New infrastructure (build during Wave 26):**
- [ ] `Testing/test-utils/factories.ts` — add `makeComment`, `makeCommentWithAuthor`. Re-export.
- [ ] `Testing/test-utils/mocks/supabase-channel.ts` (NEW) — mock factory for `supabase.channel(...).on(...).subscribe()`. Used by `useTaskCommentsRealtime` test.
- [ ] If `crypto.randomUUID` is missing in jsdom for the optimistic insert: add `globalThis.crypto = { randomUUID: () => '00000000-0000-0000-0000-000000000000' }` to `setupTests.ts`. Verify by running tests once first; many recent jsdom versions have it.

**E2E impact:**
- New feature file: `Testing/e2e/features/project/task-comments.feature` deferred — no wave assigned. Wave 26 itself does NOT add E2E scenarios; unit tests + manual smoke cover it.

---

### Wave 27 — Activity Log + Realtime Presence

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/projects/hooks/useProjectRealtime.test.ts` | Existing test mocks `supabase.channel`. Wave 27 adds a SECOND channel via `useProjectPresence`. The two hooks are independent — no collision in production code. The existing test isn't affected because it tests a different hook. | No change; verify the test is scoped to `useProjectRealtime` only. |
| `Testing/unit/features/tasks/components/TaskDetailsView.*.test.tsx` (4 files) | Wave 27 adds collapsed `<details>` activity rail. If tests mock `useTaskActivity` or render `<details>` closed by default, no impact. Open-state tests would need the new mock. | Add `vi.mock('@/features/projects/hooks/useProjectActivity', () => ({ useTaskActivity: () => ({ data: [], isLoading: false }) }))` to the four `TaskDetailsView.*.test.tsx` files. |
| `Testing/unit/features/tasks/components/TaskList.test*` (if exists) | Wave 27 passes a new `presentUsers` prop down through `TaskList` → `TaskItem`. If a test renders `TaskList` with prop expectations, it'll break unless updated to pass the new prop or default it to `[]`. | Add `presentUsers={[]}` default in any `TaskList` render call in tests. |

**New tests:**
- [ ] `Testing/unit/shared/api/planterClient.activityLog.test.ts`
- [ ] `Testing/unit/features/projects/hooks/useProjectActivity.test.tsx`
- [ ] `Testing/unit/features/projects/components/ProjectActivityTab.test.tsx`
- [ ] `Testing/unit/features/projects/hooks/useProjectPresence.test.tsx`
- [ ] `Testing/unit/features/projects/components/PresenceBar.test.tsx`
- [ ] `Testing/unit/features/tasks/hooks/useTaskFocusBroadcast.test.ts`

**New infrastructure:**
- [ ] `Testing/test-utils/factories.ts` — `makeActivityLogRow`, `makeActivityLogWithActor`, `makePresenceState`.
- [ ] Reuse `Testing/test-utils/mocks/supabase-channel.ts` from Wave 26; extend it to support presence events (`presence.sync`, `.join`, `.leave`) if not already present.

**E2E impact:**
- New scenarios: activity log appears after task create/update/delete; presence chips show in two browsers. Deferred — no wave assigned.
- Persona seed: ensure the global setup logs in TWO instances of the `editor` user (or two different users on the same project) to exercise presence dedup. Add a `Testing/e2e/fixtures/two-users.fixture.ts` if needed.

---

### Wave 28 — Gantt Chart

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/shared/lib/date-engine/index.test.ts` | Wave 28 doesn't touch date-engine — only consumes existing exports (`compareDateAsc`, `isBeforeDate`). | No change. |
| `Testing/unit/features/tasks/hooks/useTaskMutations.test.ts` | Wave 28 reuses `useUpdateTask` unchanged. | No change. |
| `Testing/unit/features/tasks/hooks/useTaskQuery.test.ts` | Wave 28 reads from the same React Query cache. No code change to the hook. | No change. |

**New tests:**
- [ ] `Testing/unit/pages/Gantt.test.tsx`
- [ ] `Testing/unit/features/gantt/components/ProjectGantt.test.tsx`
- [ ] `Testing/unit/features/gantt/hooks/useGanttDragShift.test.ts`
- [ ] `Testing/unit/features/gantt/lib/gantt-adapter.test.ts`

**New infrastructure:**
- [ ] `Testing/test-utils/factories.ts` — `makeGanttRow` (gantt-task-react `Task` shape).
- [ ] Mock `gantt-task-react`: `vi.mock('gantt-task-react', () => ({ Gantt: vi.fn(({ tasks, onDateChange }) => null), ViewMode: { Day: 'Day', Week: 'Week', Month: 'Month' } }))`. Per-test or extracted to `Testing/test-utils/mocks/gantt.ts` if used >1x.

**E2E impact:**
- New scenario: navigate `/gantt?projectId=:id`, drag a bar, verify dates persist. Deferred — no wave assigned.

---

### Wave 29 — Checkpoint Project Kind + Phase Lead

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/projects/components/EditProjectModal.test.tsx` | Wave 29 adds a new `<RadioGroup>` for project_kind. If the existing test queries by index or asserts the form's exact shape, it could break. If it queries by label/role, it won't. | Read the test first; if it queries by role/label, no change. If it queries by structure, update to account for the new field. |
| `Testing/unit/features/projects/components/EditProjectModal.testSend.test.tsx` | Same as above — different scenario but same component. | Same. |
| `Testing/unit/shared/lib/date-engine/index.test.ts` | Wave 29 adds `isCheckpointProject` (new export, no breaking change). Adds an early-return in `recalculateProjectDates` when given a checkpoint root. Existing tests pass non-checkpoint roots → unchanged behavior. | No change to existing tests. **Add new tests** for the checkpoint branches (covered by `Testing/unit/shared/lib/date-engine/checkpoint.test.ts` per the plan). |
| `Testing/unit/shared/lib/date-engine.urgency.test.ts` | Wave 29 adds `deriveUrgencyForProject` as a NEW wrapped function — does NOT widen `deriveUrgency` itself. Existing tests for `deriveUrgency` stay green. | No change. |
| `Testing/unit/features/people/hooks/useTeam.test.ts` | Wave 29 reads `useTeam(projectId).teamMembers` for the Phase Lead picker. The hook isn't changed. | No change. |

**New tests:**
- [ ] `Testing/unit/features/projects/lib/project-kind.test.ts`
- [ ] `Testing/unit/features/projects/lib/phase-lead.test.ts`
- [ ] `Testing/unit/shared/lib/date-engine/checkpoint.test.ts`
- [ ] `Testing/unit/features/projects/components/EditProjectModal.kind.test.tsx`
- [ ] `Testing/unit/features/projects/components/PhaseCard.donut.test.tsx`
- [ ] `Testing/unit/features/tasks/components/TaskFormFields.phaseLead.test.tsx`

**New infrastructure:**
- No new factories required (existing `makeProject` + `makeTask` cover the cases when their `settings` are overridden via `makeProject({ settings: { project_kind: 'checkpoint' } })`).

**E2E impact:**
- New scenarios: checkpoint kind toggle + lock UX; phase-lead viewer can edit assigned-phase tasks but not sibling phases. Deferred — no wave assigned.
- E2E persona: the existing `viewer` and `limited` personas suffice for Phase Lead testing.

---

### Wave 30 — Push & Email Notifications

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/tasks/lib/comment-mentions.test.ts` (Wave 26) | Wave 30 extends with `resolveMentions`. Existing `extractMentions` tests stay; add `resolveMentions` cases. | Add new `describe('resolveMentions', ...)` block. |
| `Testing/unit/features/tasks/components/TaskComments/TaskComments.test.tsx` (Wave 26) | Wave 30 wires `CommentComposer` to call `resolveMentions(handles)` between extract and persist. The existing test mocks `useCreateComment`; if it doesn't mock `planter.rpc('resolve_user_handles', ...)`, the test still passes (rpc fails → handles passed through verbatim). | Optional: add a test that asserts mentions array contains uuids when the RPC succeeds. |
| `Testing/unit/features/settings/hooks/useSettings.test.ts` | Wave 30 doesn't change `useSettings`; adds a separate `useNotificationPreferences`. | No change. |
| `Testing/unit/shared/contexts/AuthContext.test.tsx` | Wave 30 adds the `bootstrap_notification_prefs` trigger on auth.users. Unit tests mock Supabase auth — trigger does NOT fire in unit tests. | No change. |

**New tests:**
- [ ] `Testing/unit/shared/api/planterClient.notifications.test.ts`
- [ ] `Testing/unit/features/settings/hooks/useNotificationPreferences.test.tsx`
- [ ] `Testing/unit/features/settings/hooks/usePushSubscription.test.tsx`
- [ ] `Testing/unit/pages/Settings.notifications.test.tsx`
- [ ] `Testing/unit/supabase/functions/dispatch-push.test.ts`
- [ ] `Testing/unit/supabase/functions/dispatch-notifications.test.ts`
- [ ] `Testing/unit/supabase/functions/overdue-digest.test.ts`

**New infrastructure:**
- [ ] `Testing/test-utils/factories.ts` — `makeNotificationPref`, `makeNotificationLogRow`, `makePushSubscription`.
- [ ] `Testing/test-utils/mocks/service-worker.ts` (NEW) — `installServiceWorkerMock()`. Sets up `navigator.serviceWorker` with stubs for `register`, `ready`, `controller`, `getRegistration`.
- [ ] `Testing/test-utils/mocks/notification-api.ts` (NEW) — `installNotificationMock(initialPermission)`. Sets up `Notification.permission`, `Notification.requestPermission()`, `PushManager`.
- [ ] `Testing/setupTests.ts` — call `installServiceWorkerMock()` and `installNotificationMock('default')` from a `beforeAll` so EVERY test starts with a clean SW + Notification mock. Individual tests can override with `Notification.permission = 'granted'` etc.

**E2E impact:**
- Push notification E2E: Playwright supports notifications via `context.grantPermissions(['notifications'])`. Deferred — no wave assigned.
- The `dispatch-notifications` cron is operator-scheduled; E2E tests can manually invoke via `planter.functions.invoke('dispatch-notifications', {})` to drive the state machine.
- Email delivery in test mode: Resend has a test mode; document the API key swap in the wave's PR description.

---

### Wave 31 — Localization Framework

**THIS IS THE HIGHEST-IMPACT WAVE FOR EXISTING TESTS.** Every component test that asserts UI strings will break.

**Existing tests at risk (this is a partial list — assume EVERY component test is affected):**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/projects/components/EditProjectModal.test.tsx` | Asserts strings like "Save", "Cancel", "Published". Wave 31 makes these `t('common.save')` etc. The rendered DOM still shows "Save" (en.json has it), so `getByText('Save')` still works — IF the test wraps the render in an `<I18nextProvider>` with the en.json resources. | **Two paths:** (A) extend `renderWithQueryClient` (or create `renderWithProviders`) to include `<I18nextProvider>` automatically — every test passes through unchanged. (B) per-test `vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }) }))` returning the key as the translation — but this means `getByText('Save')` becomes `getByText('common.save')`, which is a giant test rewrite. **Choose path A.** Wave 31 plan should add `<I18nextProvider>` wrapping to the render utility. |
| `Testing/unit/features/projects/components/EditProjectModal.testSend.test.tsx` | Same as above. | Path A. |
| `Testing/unit/features/projects/components/ProjectSwitcher.test.tsx` | Same. | Path A. |
| `Testing/unit/features/tasks/components/StrategyFollowUpDialog.test.tsx` | Asserts dialog title strings etc. | Path A. |
| `Testing/unit/features/tasks/components/StrategyFollowUpDialog.related.test.tsx` | Same. | Path A. |
| `Testing/unit/features/tasks/components/TaskDetailsView.coachingBadge.test.tsx` | Asserts "Coaching" badge text. en.json key `tasks.detail.coaching_badge` resolves to "Coaching". | Path A. |
| `Testing/unit/features/tasks/components/TaskDetailsView.email.test.tsx` | Email dialog has many strings. | Path A. |
| `Testing/unit/features/tasks/components/TaskDetailsView.related.test.tsx` | Asserts "Related Tasks" heading. | Path A. |
| `Testing/unit/features/tasks/components/TaskForm.coaching.test.tsx` | Asserts checkbox label "Coaching task". | Path A. |
| **Every other component test** | Same pattern. | Path A. |
| Tests asserting toast messages (`expect(mockToastSuccess).toHaveBeenCalledWith('Project updated')`) | Toast text now comes from `t('errors.project_update_success')` etc. | Wave 31 plan: extracted toasts use `t()` — the assertion should change to `expect(mockToastSuccess).toHaveBeenCalledWith('Project updated')` (still the resolved text, since `t('key')` returns the en value when en.json is loaded). |

**Concrete migration path** (lock this in the Wave 31 plan):

1. Create `Testing/test-utils/render-with-providers.tsx` (NEW) early in Wave 31 Task 1. Wraps `<QueryClientProvider>` + `<I18nextProvider i18n={i18n}>` with the en.json resources eagerly imported.
2. Run `grep -rn 'renderWithQueryClient' Testing/unit/` — count usage sites.
3. **Bulk-migrate every existing test from `renderWithQueryClient` → `renderWithProviders`** as part of the framework setup commit. Most tests pass unchanged because the rendered text is identical.
4. Run `npm test`; for the small set that fail (likely due to assertion drift on internal text constants — e.g., button copy that's been renamed during extraction), update them in the matching per-domain extraction commit.
5. Snapshot updates: per the wave plan, run `npm test -- -u` once per per-domain extraction commit. Review the snapshot diffs (~no changes expected if path A is used).

**New tests:**
- [ ] `Testing/unit/shared/i18n/formatters.test.ts`
- [ ] `Testing/unit/shared/i18n/en-json.test.ts`
- [ ] `Testing/unit/shared/i18n/es-json.test.ts`
- [ ] `Testing/unit/features/settings/components/LocaleSwitcher.test.tsx`

**New infrastructure:**
- [ ] `Testing/test-utils/render-with-providers.tsx` (NEW) — adds `<I18nextProvider>` around `renderWithQueryClient`.
- [ ] `Testing/test-utils/mocks/i18n.ts` (NEW) — only for tests that explicitly want to assert the i18n key (rare; default is path A).
- [ ] `Testing/setupTests.ts` — initialize i18n with en.json eagerly so the `useTranslation` hook resolves before any test renders.

**E2E impact:**
- Locale-switching scenario: change locale to Spanish, walk a few key pages, verify text is in Spanish. Deferred — no wave assigned.
- The existing E2E tests assert strings ("Login failed", "Please enter a valid email address"). These strings come from `t('errors.login_failed')` etc. **Provided the test runs in `en` locale (default), the assertions are unchanged.** No E2E test breaks.

---

### Wave 32 — UX Bug Fixes

> **Audit note (2026-04-22)**: Wave 32 was originally scoped with three tasks. The first (project due-date cache invalidation on edit) was discovered during pre-flight to already be shipped in Wave 15 (commit `c88b3e7`) with its regression test at commit `30616d8`. That task was dropped and Wave 32 now ships two tasks — the two listed below. See `.claude/wave-32-prompt.md` for the renumbered task list.

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` (exists) | Task 1 rewrites the `milestones` predicate and fixes any inert status filters. Any test that exercises the old (wrong) milestone behavior will need to be rewritten. | Read the file first; keep the structure, rewrite the milestone assertions to match `task_type === 'milestone'` rather than the structural-position heuristic. |
| `Testing/unit/pages/Dashboard.test.tsx` (if exists) | Task 2 adds a "New Template" button in the Dashboard header. `CreateTemplateModal` is already imported + mounted; Task 2 only adds the button that fires `actions.setShowTemplateModal(true)`. Existing assertions that count header buttons will go from N to N+1. | Extend: add a new test for the button wiring (spy on `useDashboard`'s `actions.setShowTemplateModal`); fix any header-button-count assertion. |

**New tests:**
- [ ] `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` — extend. Fixture: 1 project, 2 phases, 3 milestones (`task_type: 'milestone'`), 5 mixed-status tasks. Assert each of the 9 filters returns the correct subset. Milestone filter returns ONLY `task_type === 'milestone'` rows.
- [ ] `Testing/unit/pages/Dashboard.test.tsx` — extend or NEW. Assert: "New Template" button renders; clicking it calls `actions.setShowTemplateModal(true)`.

**New infrastructure:**
- [ ] No new factories. Existing `makeTask`, `makeProject` cover the scenarios via overrides (add `task_type: 'milestone'` override if the factory doesn't accept it today; tiny extension).

**E2E impact:**
- Zero new E2E scenarios. Unit coverage is sufficient for these fixes.

---

### Wave 33 — Unified Tasks View

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/pages/DailyTasks.test.tsx` (if exists) | Task 2 DELETES the `/daily` page. This test must be deleted, not skipped. Any useful assertions (the date-badge rendering logic) are folded into the new `TaskItem.dueBadge.test.tsx`. | Delete the file. Port any unique fixture data / assertions into the new tests. |
| `Testing/unit/pages/TasksPage.test.tsx` (if exists) | Tasks 2 + 3 both add surfaces to TasksPage: due-date range filter UI, details-panel mount, task-title tooltip. | Extend in place. Don't create parallel suites. |
| `Testing/unit/features/tasks/components/TaskItem.test.tsx` (if exists) | Task 2 adds a due-date badge; Task 3 wraps the title in `<Tooltip>`. Existing assertions about row structure may need small selector updates (tooltip wrapper adds a DOM node). | Extend. Prefer semantic queries (`getByRole('button')`, `getByText`) over brittle structural selectors. |
| `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` | Task 2 adds `dueDateRange` to the filter state. The Wave 32 tests shouldn't break, but the test for the full filter-state shape (if any) needs the new field. | Extend: add `dueDateRange` cases (inclusive bounds, open-ended, AND-combination with status filters). |
| Any test rendering `<App>` at the root | Task 1 adds `<TooltipProvider>` to the app shell. If a test renders `<App>` directly (not via `renderWithProviders`), tooltips won't work — but they also weren't there before, so this only matters for Task 3's tooltip assertions. | Route new tests through the existing `renderWithProviders` helper; add TooltipProvider to that helper if it doesn't already wrap it. |

**New tests:**
- [ ] `Testing/unit/shared/ui/tooltip.test.tsx` — smoke: `userEvent.hover` on trigger reveals content.
- [ ] `Testing/unit/shared/lib/date-engine/formatTaskDueBadge.test.ts` — relative-wording rules ("Today", "Tomorrow", weekday + short date, full date), injected clock.
- [ ] `Testing/unit/features/tasks/components/TaskItem.dueBadge.test.tsx` — colors + wording per distance-from-today.
- [ ] `Testing/unit/pages/TasksPage.test.tsx` (extend or NEW) — click → panel opens; filter change preserves panel; hover title reveals project name.

**New infrastructure:**
- [ ] Extend `Testing/test-utils/render-with-providers.tsx` (if it exists; else add) to wrap in `<TooltipProvider delayDuration={0}>` so Task 3's hover tests are deterministic.
- [ ] No new factories. Use existing `makeTask` with `due_date` + `root_id` overrides.

**E2E impact:**
- Navigation smoke: typing `/daily` lands on `/tasks` (redirect). Add one Playwright scenario.
- Tooltip hover + panel-click scenarios are better covered in unit tests (Playwright hover is flaky across browsers).

---

### Wave 34 — Advanced Admin Management

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/shared/contexts/AuthContext.test.tsx` | Wave 34 doesn't change AuthContext; just consumes `isAdmin`. | No change. |
| `Testing/unit/shared/api/auth.test.ts` | Wave 34 doesn't change `authApi`. | No change. |
| All other tests | No impact. | No change. |

**New tests:**
- [ ] `Testing/unit/pages/admin/AdminLayout.test.tsx`
- [ ] `Testing/unit/pages/admin/AdminUsers.test.tsx`
- [ ] `Testing/unit/pages/admin/AdminAnalytics.test.tsx`
- [ ] `Testing/unit/pages/admin/components/AdminSearch.test.tsx`
- [ ] `Testing/unit/features/admin/hooks/useAdminUsers.test.tsx`
- [ ] `Testing/unit/features/admin/hooks/useAdminAnalytics.test.tsx`

**New infrastructure:**
- [ ] `Testing/test-utils/factories.ts` — `makeAdminUser` (just a lightweight wrapper around `auth.users` shape).
- [ ] No new mock files; the admin RPCs are mocked via the existing planterClient mock pattern: `planter.admin.searchUsers = vi.fn().mockResolvedValue([...])`.

**E2E impact:**
- New persona: `e2e/.auth/admin.json` — sign in as an admin user (`admin@example.com` or similar; pre-create in `scripts/seed-e2e.js` and add to `admin_users` table).
- Wave 34 needs to extend `seed-e2e.js` to insert the admin user into `admin_users`. Document in the wave plan.
- New E2E feature files: `Testing/e2e/features/admin/admin-shell.feature` and `admin-users.feature`.

---

### Wave 35 — External Integrations (ICS only)

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| All existing tests | Wave 35 adds a new ICS endpoint + token table; no existing API or behavior changes. | No change. |

**New tests:**
- [ ] `Testing/unit/shared/api/planterClient.integrations.ics.test.ts`
- [ ] `Testing/unit/supabase/functions/ics-feed.test.ts`

**New infrastructure:**
- [ ] `Testing/test-utils/factories.ts` — `makeIcsFeedToken`.

**E2E impact:**
- ICS feed E2E: simple — fetch the feed URL, parse the .ics, assert structure. Deferred — no wave assigned.

---

### Wave 36 — Template Hardening

**Existing tests at risk:**

| Test file | Risk | Mitigation |
| --- | --- | --- |
| `Testing/unit/shared/api/planterClient.clone.stamp.test.ts` (Wave 22) | Tasks 1 + 2 modify `clone_project_template` RPC behavior: now also stamps `cloned_from_template_version` (Task 1) and `cloned_from_task_id` on every cloned descendant (Task 2). The existing test asserts that `Task.clone` follows up with a `Task.update` writing `settings.spawnedFromTemplate`. **Task 1 + 2 work happens server-side in the RPC** — the client-side `Task.clone` payload doesn't change. | Likely no change. **But verify**: if the client-side `Task.clone` is updated to wait for the new fields in the response, the assertion needs extending. Read the file. |
| `Testing/unit/features/tasks/hooks/useTaskMutations.test.ts` | Task 2's UI delete-guard adds a confirmation dialog before delete. If `useDeleteTask` test triggers a delete on a cloned task, the new dialog interaction would block. **The dialog is in the COMPONENT (`TaskDetailsView`), not the hook.** So `useDeleteTask` is unchanged. | No change to hook tests. New tests cover the component-level guard. |

**New tests:**
- [ ] `Testing/unit/shared/api/planterClient.template.versioning.test.ts`
- [ ] `Testing/unit/features/tasks/components/TaskDetailsView.deleteGuard.test.tsx`

**New infrastructure:**
- [ ] No new factories required. The existing `makeTask` + `makeProject` cover the added `settings` fields via overrides.

**E2E impact:**
- Template versioning: clone a template, verify version stamp in DB. Deferred — no wave assigned.
- Template immutability delete-guard: non-owner attempts delete on cloned task, dialog appears. Deferred — no wave assigned.

---

## 4. E2E persona + seed evolution

| Wave | New persona / seed step |
| --- | --- |
| 26 | None |
| 27 | Two-tab fixture: `Testing/e2e/fixtures/two-users.fixture.ts` — opens two browser contexts as the same `editor` user OR two different users on the same project, for presence + activity scenarios |
| 28 | None |
| 29 | None — existing `viewer` and `limited` personas suffice for Phase Lead scenarios |
| 30 | Service worker permission grant: `context.grantPermissions(['notifications'])` per-test for push scenarios |
| 31 | Locale-switch helper in `common.steps.ts`: `Given the user's locale is "es"` step that calls `localStorage.setItem('planterplan.locale', 'es')` before navigation |
| 32 | Offline helper in `common.steps.ts`: `Given the user is offline` / `Given the user is back online` steps that call `context.setOffline(true|false)` |
| 32 | None new — Wave 32 is a bug-fix wave with unit-test coverage only |
| 33 | `/daily` → `/tasks` redirect smoke; no new persona |
| 34 | New `admin@example.com` persona; `e2e/.auth/admin.json`; extend `seed-e2e.js` to insert the user into `admin_users` |
| 35 | ICS feed endpoint smoke: fetch the feed URL with a token and parse the .ics output |
| 36 | None new — existing personas test all template-versioning + immutability scenarios |

---

## 5. Test gates per wave (verification commands)

Every wave's verification gate uses the same baseline commands. Add the wave-specific manual smokes per the wave plan.

```bash
npm run lint      # 0 errors, ≤7 warnings
npm run build     # clean (tsc -b && vite build)
npm test          # unit + integration; baseline + new wave's tests
git status        # clean
```

For Waves 28, 30, 34 with route additions: also confirm the new chunk is lazy-loaded via `npm run build` chunk inventory.

For Waves 31 + 33: also run `npm run test:e2e` after the unit suite (locale switcher + `/daily` redirect need E2E coverage).

---

## 6. Quick reference: "tests that touch THIS file" lookup

When a wave plan modifies a source file, use this table to find the existing test files that depend on it.

| Source file (modified by wave) | Existing test files that mock or render it |
| --- | --- |
| `src/features/tasks/components/TaskDetailsView.tsx` | `TaskDetailsView.coachingBadge.test.tsx`, `TaskDetailsView.email.test.tsx`, `TaskDetailsView.related.test.tsx`. (Wave 26 + 27 + 29 + 36 modify this; Wave 36 adds `TaskDetailsView.deleteGuard.test.tsx`.) |
| `src/features/tasks/components/TaskList.tsx` | (Verify with grep — likely none directly; tests render via integration through `Project.tsx` which has its own e2e) |
| `src/features/tasks/components/TaskItem.tsx` | `TaskItem.test.tsx` (if exists). **Wave 33** adds `TaskItem.dueBadge.test.tsx` and extends existing selectors to account for the `<Tooltip>` wrapper around the title. |
| `src/features/tasks/components/TaskFormFields.tsx` | `TaskForm.coaching.test.tsx` (Wave 22 precedent). Wave 29 adds new field-level tests. |
| `src/features/tasks/hooks/useTaskMutations.ts` | `useTaskMutations.test.ts`, `useTaskMutations.coachingRefetch.test.ts`. |
| `src/features/tasks/hooks/useTaskComments.ts` (Wave 26) | `useTaskComments.test.tsx` (NEW Wave 26). |
| `src/features/tasks/hooks/useTaskFilters.ts` | **Wave 32** fixes the `milestones` + inert-status predicates; **Wave 33** adds `dueDateRange`. Tests: `useTaskFilters.test.ts` (already exists pre-Wave-32; Wave 32 extends with per-filter fixture coverage, Wave 33 extends again with `dueDateRange`). |
| `src/features/projects/components/EditProjectModal.tsx` | `EditProjectModal.test.tsx`, `EditProjectModal.testSend.test.tsx`. Wave 29 adds `EditProjectModal.kind.test.tsx`. |
| `src/features/projects/components/ProjectSwitcher.tsx` | `ProjectSwitcher.test.tsx`. (Not modified post-Wave-25.) |
| `src/features/projects/components/PhaseCard.tsx` | (No existing test inventory entry; Wave 29 adds `PhaseCard.donut.test.tsx`.) |
| `src/features/projects/hooks/useProjectMutations.ts` | `useProjectMutations.test.ts`. The dual-cache-invalidation assertion (`['projects']` + `['project', projectId]`) was originally scoped into Wave 32 but discovered during pre-flight to have landed in Wave 15 (commit `c88b3e7`); test coverage landed at commit `30616d8`. Wave 32 dropped this task. |
| `src/features/projects/hooks/useProjectRealtime.ts` | `useProjectRealtime.test.ts`. (Not modified by Wave 27 — `useProjectPresence` is a separate hook.) |
| `src/pages/TasksPage.tsx` | `TasksPage.test.tsx` (if exists). **Wave 33** adds due-date range filter, click-to-panel, title tooltip wiring — extends this file in place. |
| `src/pages/Dashboard.tsx` | `Dashboard.test.tsx` (if exists). **Wave 32** adds "New Template" button assertion. |
| `src/shared/api/planterClient.ts` | `planterClient.test.ts`, `planterClient.clone.stamp.test.ts`, `planterClient.listSiblings.test.ts`, `planterClient.updateStatus.syncflags.test.ts`. **Every wave that adds a new entity namespace also adds a new test file** (`planterClient.taskComments.test.ts`, `.activityLog.test.ts`, `.notifications.test.ts`, `.integrations.ics.test.ts`, `.template.versioning.test.ts`). |
| `src/shared/lib/date-engine/index.ts` | `date-engine/index.test.ts`, `date-engine/payloadHelpers.test.ts`, `date-engine.urgency.test.ts`. (Wave 29 adds `checkpoint.test.ts`; Wave 33 adds `formatTaskDueBadge.test.ts`.) |
| `src/shared/contexts/AuthContext.tsx` | `AuthContext.test.tsx`, `AuthContext.savedEmailAddresses.test.tsx`. (Wave 30 doesn't change AuthContext.) |
| `src/shared/ui/tooltip.tsx` (NEW in Wave 33) | `tooltip.test.tsx` (NEW in Wave 33). |
| `src/shared/db/database.types.ts` | (No direct test; type drift caught at compile time via `npm run build`.) |
| `src/pages/Settings.tsx` | (No existing test inventory entry. Wave 30 adds `Settings.notifications.test.tsx`.) |

---

## 7. What NOT to test (out of scope across all waves)

- **Web Push browser push delivery** (Wave 30) — VAPID + browser handle this. Test the dispatcher's pref-respect + quiet-hours + 410-cleanup logic.
- **DB triggers fire in unit tests** — they DON'T. Unit tests mock Supabase. Test trigger correctness via `psql` smokes documented in `docs/db/tests/*.sql`.
- **i18n key resolution against .json files** (Wave 31) — covered by `en-json.test.ts` + `es-json.test.ts`. Don't re-assert in every component test; just check the rendered text matches the en value.

---

## 8. Verification: this strategy doc itself

This doc claims facts about existing test files. Verify when starting any wave:

```bash
# Confirm the test file inventory matches reality
find Testing/unit -name '*.test.*' | wc -l   # expect 50 at start of Wave 26; grows per wave

# Confirm specific files mentioned exist
ls Testing/test-utils/factories.ts Testing/test-utils/query-wrapper.tsx Testing/setupTests.ts

# Confirm existing test patterns
grep -l 'createChain' Testing/unit/shared/api/  # expect at least planterClient.test.ts
grep -l 'createTestQueryClient' Testing/test-utils/

# E2E personas
ls Testing/e2e/.auth/ 2>/dev/null  # expect owner.json, editor.json, viewer.json, limited.json, coach.json, user.json
```

If any check fails, the test landscape has drifted from this doc — the wave plan's Pre-flight verification should catch it. Stop and reconcile before proceeding.
