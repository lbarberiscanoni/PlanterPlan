## Session Context

PlanterPlan is a church planting project management app (React 18 + TypeScript + Supabase + Vite). Read `CLAUDE.md` for conventions and architecture. Strict typing, Feature-Sliced Design (FSD) boundaries, no direct Supabase calls in components, no raw date math — all enforced. See `.gemini/styleguide.md` for the full bar.

Wave 31 shipped to `main`:
- i18next localization framework (en baseline + es machine-translated)
- LocaleSwitcher in Settings → Profile
- React rollback 19 → 18.3.1 (scope expansion — unblocked Vercel previews)

**Roadmap note**: original Waves 32 (PWA + Offline), 34 (White Labeling), 35 (Stripe Monetization + Licensing), and 38 (Release Cutover) were descoped from the earlier plan, and wave numbers were reassigned to the current remaining scope. After Wave 32 (this wave) the active roadmap is: Wave 33 (unified Tasks view) → Wave 34 (Advanced Admin Management) → Wave 35 (ICS feeds) → Wave 36 (template hardening).

Wave 32 ships **two targeted UX bug fixes** surfaced from usage testing. Each is a small, isolated fix — neither task should produce a PR over ~200 LOC.

> **Audit note (2026-04-22):** a third bug — "project due date does not persist after save" — was originally scoped into Wave 32 as Task 1. During pre-flight verification the fix was discovered to have already shipped in commit `c88b3e7` (Wave 15 "Refactor Sprint — Stabilization & QoL"), and the regression test is already present in `Testing/unit/features/projects/hooks/useProjectMutations.test.ts` (commit `30616d8` — "Move all testing files to dedicated Testing/ directory"). The task is therefore pre-satisfied and dropped. See `docs/dev-notes.md` for the audit trail.

**Test baseline going into Wave 32:** Run `npm test` and record. Lint baseline: 0 errors, ≤7 warnings — do not regress. Each task adds a regression test that would have caught the bug; no new functional surfaces.

**Read `.claude/wave-testing-strategy.md` before starting.** Wave 32 specific: both tasks touch existing files (`useTaskFilters` and `Dashboard`) already covered by `useTaskFilters.test.ts` and `Dashboard.test.tsx` (if it exists). Extend them in place; don't create parallel suites.

## Pre-flight verification (run before any task)

1. `git log --oneline` includes the Wave 31 commits + docs sweep + the earlier descoping commit.
2. Confirm the files referenced below actually exist at the line numbers cited:
   - `src/features/tasks/hooks/useTaskFilters.ts` (Task 1 — `buildMilestoneIdSet` helper at ~lines 50-63; `milestones` case at ~lines 117-118)
   - `src/pages/Dashboard.tsx` (Task 2 — header "New Project" button at ~lines 127-133; `CreateTemplateModal` already imported + mounted at ~lines 20 and 179-183; `handleCreateTemplate` handler already wired at ~lines 60-91)
   - `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` (exists; extend in place)
3. Confirm `task_type` column on `public.tasks` is present — migration `docs/db/migrations/2026_04_18_task_type_discriminator.sql` must be in the tree (Wave 25 precedent). Task 1 relies on this column.
4. Confirm `TaskRow` (`src/shared/db/app.types.ts`) exposes `task_type`. Task 1 consumes it through the typed `TaskRow`.
5. Confirm `useDashboard()` exposes `state.showTemplateModal` + `actions.setShowTemplateModal` — Task 2 only needs a button that fires the existing action.

## Branch

One branch per task, cut from `main`:
- Task 1 → `claude/wave-32-task-filter-regressions`
- Task 2 → `claude/wave-32-new-template-button`

Open a PR to `main` after each task's verification gate passes. Do **not** push directly to `main`.

## Wave 32 scope

Two tasks. Order does not matter — each is self-contained.

---

### Task 1 — Tasks page status filters are broken

**Commit:** `fix(wave-32): correct milestone/status filtering in useTaskFilters`

**Symptom:** on the Tasks page (`/tasks`), selecting the **Milestones** filter returns a mix of To-Do items rather than just milestone-level rows. Some other status filters appear inert (return the full list unchanged). User report is imprecise about WHICH filters are inert — verify by exercising each one.

**Suspected root cause:** `src/features/tasks/hooks/useTaskFilters.ts` exposes 9 filters (`my_tasks`, `priority`, `overdue`, `due_soon`, `current`, `not_yet_due`, `completed`, `all_tasks`, `milestones`). The `milestones` filter uses structural matching via `buildMilestoneIdSet` (grandchild-of-root — see lines 50-63) rather than filtering by the `task_type = 'milestone'` column shipped in the Wave 25 discriminator migration. Any phase-level or task-level row that happens to be at the "grandchild" depth leaks through regardless of completion state.

**Fix:**
1. Exercise every filter in the UI first — write down which return the wrong rows. The bug report covers milestones; verify the "some filters do nothing" claim on each.
2. Rewrite `milestones` to filter by `task_type === 'milestone'` (per `public.tasks.task_type` — Wave 25), not by structural position. Delete `buildMilestoneIdSet` unless something else still needs it (grep first — nothing else should).
3. For any status filters that are demonstrably inert: read the predicate, identify why it returns everything, fix minimally. Common suspects: comparing `task.status` against a literal that doesn't match the Wave 23 canonical set (`'todo' | 'not_started' | 'in_progress' | 'completed'`) — not e.g. `'not-started'` with a dash.
4. Do not broaden scope: leave the 9 filter IDs in place; only correct the predicates.

**Tests:**
- `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` — extend in place. Seed a fixture tree with: 1 root project, 2 phases, 3 milestones (one under each phase, `task_type: 'milestone'`), 5 tasks (mixed `todo`/`in_progress`/`completed`), and assert each filter returns the exact expected subset.
- Use existing `makeTask` / `makeProject` factories in `Testing/test-utils/factories.ts`. Pass `task_type: 'milestone'` via overrides; extend the factory if it doesn't accept the field today.

**Files:**
- `src/features/tasks/hooks/useTaskFilters.ts` (primary fix)
- `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` (regression coverage)

**DB migration?** No.

**Out of scope:** redesigning the filter UI; adding new filters (Wave 33 adds due-date range). Any "the filter dropdown itself is confusing" polish.

---

### Task 2 — No "New Template" button on Dashboard

**Commit:** `feat(wave-32): surface New Template button alongside New Project on Dashboard`

**Symptom:** Dashboard header exposes a **New Project** button but no **New Template** counterpart. Template creation is reachable only via `/dashboard?action=new-template` URL hack or via the `ProjectSidebar` button (only visible inside a project). Users cannot discover template creation from a cold start.

**State of play (verified 2026-04-22):** `CreateTemplateModal` is already imported and mounted in [Dashboard.tsx:20](src/pages/Dashboard.tsx:20) + [179-183](src/pages/Dashboard.tsx:179). `handleCreateTemplate` is wired at [Dashboard.tsx:60-91](src/pages/Dashboard.tsx:60). The modal's open-state is in `useDashboard()` as `state.showTemplateModal` + `actions.setShowTemplateModal`. **The only missing piece is a header button that triggers the modal.** Earlier drafts of this plan offered an "Option A vs B" choice (prop-based mode toggle vs. sibling modal) — that choice is pre-resolved: the sibling modal is already in-tree.

**Fix:**
1. In `src/pages/Dashboard.tsx` header section at ~lines 126-134, add a **New Template** button next to the existing New Project button. Use the `Button` component's `variant="secondary"` (from `src/shared/ui/button.tsx` — mirrors the styleguide's secondary spec: `bg-white border border-slate-300 text-slate-700`). **Do NOT copy the existing New Project button's inline `bg-orange-500 hover:bg-orange-600` classes** — they predate the `variant` system and are pre-existing styleguide drift; this task must not propagate them. Match only the sizing and icon pattern (use a complementary `lucide-react` icon; the existing button uses `Plus`).
2. Wire `onClick={() => actions.setShowTemplateModal(true)}`. No new state, handler, or modal work required.
3. **Authorization**: match whatever gates the existing `ProjectSidebar` "New Template" affordance — don't loosen or tighten it. Grep `ProjectSidebar.tsx` (or wherever the sibling button lives) for the admin/role check and mirror it. If the existing flow is un-gated, leave the Dashboard button un-gated too.
4. Localization: pull the label through `t('dashboard.new_template')`. Add the key to `src/shared/i18n/locales/en.json` (and placeholder in `es.json` — see Wave 31 convention). The related `dashboard.template_created_toast` key already exists in `en.json`, so follow the same namespace.

**Tests:**
- `Testing/unit/pages/Dashboard.test.tsx` — extend or NEW. Assert: button renders; clicking it calls `actions.setShowTemplateModal(true)` (verify via the `useDashboard` mock's spy).
- No need to re-test `CreateTemplateModal` internals — that surface is already covered elsewhere (or out of scope if not).

**Files:**
- `src/pages/Dashboard.tsx` (header button only — ~10 LOC)
- `src/shared/i18n/locales/en.json` + `es.json` (new key)
- `Testing/unit/pages/Dashboard.test.tsx`

**DB migration?** No.

**Out of scope:** a dedicated `/templates/new` route; touching `CreateTemplateModal` internals (already mounted + wired); template-specific form fields; library redesign; any refactor of `useDashboard` state shape.

---

## Documentation Currency Pass (mandatory — before review)

1. **`spec.md`** — flip the new §3.2 bullet "Create Template affordance on Dashboard" to `[x]`. Add a short note under the top-level status line: "Wave 32 closed two UX bugs (Tasks-page status filters, New Template button on Dashboard); a third scoped bug — project due-date cache invalidation — was discovered pre-flight to already be shipped in Wave 15 and was dropped." Bump the spec version patch (not minor — these are fixes, not features). Update `Last Updated`.
2. **`docs/AGENT_CONTEXT.md`** — no golden-path change; skip unless a file path moved.
3. **`docs/dev-notes.md`** — append under an "Active" subsection: "**Resolved (Wave 32)**: milestone + inert status filters; New Template button on Dashboard. **Audit note**: the originally-scoped third Wave 32 task (project due-date cache invalidation on edit) was found during pre-flight to be already fixed in Wave 15 (commit `c88b3e7`), with its regression test at commit `30616d8`. No code change was needed; task dropped."
4. **`repo-context.yaml`** — bump `wave_status.current` to `Wave 32 (UX Bug Fixes)`, update `last_completed`, `spec_version`, add a short `wave_32_highlights:` block covering the two shipped fixes + the audit discovery.
5. **`CLAUDE.md`** — no changes expected.

Land docs as `docs(wave-32): documentation currency sweep`.

## Wave Review (mandatory — before commit + push to main)

1. **Task 1 smoke** — on `/tasks`, cycle through each filter; every filter narrows the list correctly. Milestones returns ONLY `task_type = 'milestone'` rows.
2. **Task 2 smoke** — cold-load Dashboard → "New Template" button is visible → click opens the existing `CreateTemplateModal` → create template → reach the `/project/:id` view for the new template (existing `handleCreateTemplate` behavior).
3. **No FSD drift** — all new files (if any) live in the right slice. No barrel files.
4. **Type drift** — `npm run build` green.
5. **Test-impact reconciled** — every extended test passes; no `it.skip`. Test count ≥ baseline + new regression tests.
6. **Lint + build + tests** — green per `.claude/wave-execution-protocol.md` §4 (HALT on any failure).

## Commit & Push to Main (mandatory — gates Wave 33)

After both Tasks merge:
1. `git checkout main && git pull && npm install && npm run lint && npm run build && npx vitest run`.
2. History should show: 2 task commits + 1 docs sweep commit on top of Wave 31.
3. Push to `origin/main`. CI green.
4. **Do not start Wave 33** until the above is true.

## Verification Gate (per task, before push)

**Every command below is a HALT condition per `.claude/wave-execution-protocol.md` §4.**

```bash
npm run lint      # 0 errors required (≤7 pre-existing warnings tolerated). FAIL → HALT.
npm run build     # clean (tsc -b && vite build). FAIL → HALT.
npm test          # 100% pass rate; count ≥ baseline + new regression tests. FAIL → HALT.
git status        # clean
```

Manual smoke per Wave Review.

## Key references

- `CLAUDE.md` — conventions, commands, architecture overview
- `.gemini/styleguide.md` — strict typing, FSD boundaries, Tailwind constraints
- `src/features/tasks/hooks/useTaskFilters.ts` — Task 1 surface
- `src/pages/Dashboard.tsx` — Task 2 surface
- `src/features/dashboard/components/CreateTemplateModal.tsx` — Task 2 reads only; already mounted + wired
- `src/features/dashboard/hooks/useDashboard.ts` — Task 2 reads only; `state.showTemplateModal` + `actions.setShowTemplateModal` already exposed
- `docs/db/migrations/2026_04_18_task_type_discriminator.sql` — Wave 25 `task_type` column backing Task 1's corrected predicate

## Ground Rules (non-negotiable — from `CLAUDE.md` + `.gemini/styleguide.md`)

TypeScript-only; no `.js` / `.jsx`; no barrel files; path alias `@/` → `src/`; no raw date math; no direct `supabase.from()` in components; Tailwind utility classes only (no arbitrary values, no pure black — use `slate-900` / `zinc-900`); optimistic mutations must force-refetch on error; all user-visible strings through `t('namespace.key')` (Wave 31 convention); atomic revertable commits; build + lint + tests all clean before every push.
