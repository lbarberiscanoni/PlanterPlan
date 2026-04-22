## Session Context

PlanterPlan is a church planting project management app (React 18 + TypeScript + Supabase + Vite). Read `CLAUDE.md` for conventions and architecture. Strict typing, Feature-Sliced Design (FSD) boundaries, no direct Supabase calls in components, no raw date math — all enforced. See `.gemini/styleguide.md` for the full bar.

Wave 32 shipped to `main`:
- Tasks page status-filter regressions (milestone + inert filters)
- "New Template" button on Dashboard

> The originally-scoped third Wave 32 task (project due-date cache invalidation on edit) was discovered during pre-flight to already be in the tree from Wave 15 (commit `c88b3e7`) with its regression test from commit `30616d8`; it was dropped rather than re-shipped. See `docs/dev-notes.md`.

**Roadmap note**: original Waves 32 (PWA + Offline), 34 (White Labeling), 35 (Stripe Monetization + Licensing), and 38 (Release Cutover) were descoped from the earlier plan, and wave numbers were reassigned to the current remaining scope. After Wave 33 (this wave) the active roadmap is: Wave 34 (Advanced Admin Management) → Wave 35 (ICS feeds) → Wave 36 (template hardening).

Wave 33 **unifies the task list experience**. Today there are two parallel views — `/tasks` (filter-rich but missing due-date display) and `/daily` (pretty due-date badges but no filtering). The daily view is uniformly better at date presentation; the tasks view is uniformly better at filtering. This wave merges them into a single screen, adds due-date range filtering, wires task-row click to the same `<TaskDetailsPanel>` the Project view uses, and adds a hover tooltip showing each task's parent project name.

**Test baseline going into Wave 33:** Run `npm test` and record. Lint baseline: 0 errors, ≤7 warnings — do not regress.

**Read `.claude/wave-testing-strategy.md` before starting.** Wave 33 specific: the `/daily` route is being **deleted**, not deprecated. Any existing `DailyTasks.test.tsx` must be DELETED (not left skipped) and its useful assertions folded into the new unified `TasksPage.test.tsx`. The `TaskDetailsPanel` test coverage from `Project.tsx` should be reused — don't re-test the panel itself on the Tasks page. Only test the NEW Tasks-page-side wiring (click handler, selection state, panel mount).

## Pre-flight verification (run before any task)

1. `git log --oneline` includes the 2 Wave 32 commits + docs sweep.
2. These files exist at the line numbers cited during scoping:
   - `src/pages/DailyTasks.tsx` (short date badge at ~lines 98-106)
   - `src/pages/TasksPage.tsx` (currently passes `onTaskClick={handleNoop}` at ~line 208; filters are inlined in the page as `<Select>` dropdowns around lines 136-162 — there is NO dedicated `TaskFilterBar.tsx` component today)
   - `src/pages/Project.tsx` (`<TaskDetailsPanel>` mount at ~lines 397-428; `handleTaskClick` wiring at ~line 347)
   - `src/features/tasks/components/TaskItem.tsx` (task row component — does it render due dates already? Confirmed absent pre-wave; only a status badge renders today.)
   - `src/shared/ui/popover.tsx` (exists; Radix Popover wrapper — can reuse as tooltip fallback if Task 1 is skipped)
3. Confirm `@radix-ui/react-tooltip` is NOT yet in `package.json`. Task 1 adds it.
4. Find the navigation links to `/daily` (grep the codebase for `'/daily'`). Known call sites at time of scoping: `src/app/App.tsx` (route registration), `ProjectSidebar.tsx`, `CommandPalette.tsx`. Task 2 must update all of them. Re-grep during execution — don't trust the scoping list alone.
5. Confirm `Testing/unit/pages/DailyTasks.test.tsx` does **not** exist today. If it does, it must be deleted (not skipped) during Task 2. As of 2026-04-22 pre-flight it is absent, so Task 2 only needs to handle the source file deletion.

## Branch

One branch per task, cut from `main`:
- Task 1 → `claude/wave-33-tooltip-primitive`
- Task 2 → `claude/wave-33-merge-tasks-daily`
- Task 3 → `claude/wave-33-task-click-panel-tooltip`

Tasks depend on each other in order (1 → 2 → 3). Merge Task 1 first so Task 3 can use the tooltip primitive. Task 2 can technically merge before Task 1 if Task 3 uses Popover as a tooltip fallback — but prefer the clean ordering.

Open a PR to `main` after each task's verification gate passes. Do **not** push directly to `main`.

## Wave 33 scope

Three tasks. Task 1 is infra (~50 LOC). Task 2 is the bulk of the merge (~400 LOC). Task 3 is smaller integration (~200 LOC).

---

### Task 1 — Tooltip primitive

**Commit:** `feat(wave-33): add shadcn Tooltip primitive for hover-to-reveal UX`

1. **Dependency**: `npm install @radix-ui/react-tooltip` (match existing pinned-exact pattern — no `^` or `~`). Motivate in PR: standard Radix primitive, ~3 KB gzipped, already aligned with the Shadcn stack the codebase uses everywhere else.
2. **Wrapper** (`src/shared/ui/tooltip.tsx`, NEW):
   - Follow the pattern in `src/shared/ui/popover.tsx` — re-export `TooltipProvider`, `Tooltip`, `TooltipTrigger`, and a styled `TooltipContent` with Tailwind classes matching the existing design tokens (bg-slate-900, text-slate-50, px-3 py-1.5, text-sm, rounded-md, shadow-md). No custom CSS.
   - Include the Radix `forwardRef` + `displayName` pattern exactly as `popover.tsx` does.
3. **App-shell wiring** (`src/app/App.tsx` or wherever `<QueryClientProvider>` lives): wrap the app tree in `<TooltipProvider delayDuration={300}>` — a sensible default so Task 3's tooltips don't feel sluggish.
4. **Architecture doc**: no new architecture doc; add one sentence to `docs/AGENT_CONTEXT.md` mentioning the new primitive under shared UI.
5. **Tests**:
   - `Testing/unit/shared/ui/tooltip.test.tsx` (NEW): render a `<Tooltip>` with `delayDuration={0}`, trigger a hover via `userEvent.hover`, assert the content appears. This is a smoke test — Radix's behavior is the lib's responsibility, not ours.

**DB migration?** No.

**Out of scope:** mobile-tap-to-show tooltips (Radix's default behavior already handles touch via long-press; don't add custom handlers). Tooltip portal targeting — use the default body portal.

---

### Task 2 — Merge `/tasks` and `/daily` into a unified view

**Commit:** `feat(wave-33): unify /tasks and /daily into a single filterable view with due-date badges + range filter`

**Scope**: the Tasks page keeps the filter rail but adopts the daily view's due-date badge style, plus a new due-date range filter. The `/daily` route and page are deleted.

1. **Port the due-date badge** (`src/features/tasks/components/TaskItem.tsx`):
   - Add a right-aligned badge rendered when `task.due_date` is non-null. Use the same formatting as `DailyTasks.tsx:98-106` — `formatDate(task.due_date, 'MMM d')` with color tokens: red for overdue, orange for due-soon (threshold from `settings.due_soon_threshold` when set; fall back to 3 days), otherwise neutral slate-600.
   - Relative wording rule: if due today → "Today"; if tomorrow → "Tomorrow"; if within ±7 days → weekday + short date ("Mon Apr 27"); otherwise "MMM d, yyyy". Centralize in a new `src/shared/lib/date-engine/formatTaskDueBadge.ts` (no raw date math — route through existing `date-engine` primitives).
   - This replaces the no-date-display behavior in TaskItem today. Verify the Project view's usage of TaskItem still reads fine — the Project view gets the same badges for free (desirable).

2. **Add the due-date range filter** (`src/features/tasks/hooks/useTaskFilters.ts` + wherever the filter UI actually lives):
   - Extend the filter state with `dueDateRange: { start: string | null, end: string | null }`.
   - As of 2026-04-22, filters are rendered inline in [TasksPage.tsx:136-162](src/pages/TasksPage.tsx:136) via `<Select>` dropdowns — there is no dedicated `TaskFilterBar` component. Choose the cheaper path: extend inline in `TasksPage.tsx`, OR extract the whole filter cluster into a new `src/features/tasks/components/TaskFilterBar.tsx` as part of this task. Prefer the extraction if it keeps the added date-range inputs readable; otherwise inline is fine.
   - Add a two-input date picker. Use the existing date-input component (grep for `<input type="date"` or existing Shadcn `Calendar`/`DateRangePicker` usage — don't introduce a new calendar lib).
   - Predicate: task is included when `task.due_date` (ISO) falls within `[start, end]` inclusive; open-ended on either side if one bound is null.
   - Combines with existing status filters via AND (user wants "overdue AND due this week", for instance).
   - Add to the filter state URL query-string if the existing filters serialize there — match the pattern, don't invent a new one.

3. **Delete `/daily`** (`src/pages/DailyTasks.tsx` + route registration + nav link):
   - Remove the route from `src/app/App.tsx`.
   - Redirect the deleted route: add `<Route path="/daily" element={<Navigate to="/tasks" replace />} />` so bookmarks don't 404.
   - Grep for `'/daily'` and update every nav link (sidebar, header, any in-page links) to point at `/tasks`.
   - DELETE the `src/pages/DailyTasks.tsx` file. DELETE any `DailyTasks.test.tsx`.
   - If DailyTasks had unique logic that TasksPage lacked (e.g., an "Only show my assigned" default toggle for the day view), fold that into the unified view as a default filter state when navigating from a prior-daily bookmark — OR document it as "no longer a default; users apply the existing My Tasks filter." Choose the minimal path.

4. **Localization**: all new strings through `t('tasks.dueBadge.today')`, `t('tasks.filter.dateRange.start')`, etc. Add keys to `src/shared/i18n/locales/en.json` + placeholder in `es.json`.

5. **Tests**:
   - `Testing/unit/features/tasks/components/TaskItem.dueBadge.test.tsx` (NEW): render a TaskItem with due dates at today, tomorrow, +3 days, -2 days, +60 days → assert correct wording + color class per case.
   - `Testing/unit/features/tasks/hooks/useTaskFilters.test.ts` (Wave 32 landed this file; extend here): add `dueDateRange` cases — inclusive bounds, open-ended bounds, AND-combination with `status === 'completed'`.
   - `Testing/unit/shared/lib/date-engine/formatTaskDueBadge.test.ts` (NEW): unit-level coverage for the relative-wording rules. Lock `new Date('2026-04-22')` via vi-injected clock.
   - `Testing/unit/pages/DailyTasks.test.tsx` was absent at scoping time — no deletion needed. If it reappears before you execute, delete it (not skip).

6. **Architecture doc**: `docs/AGENT_CONTEXT.md` — update the Routes section (remove `/daily`, add redirect note).

**DB migration?** No.

**Out of scope:** calendar heatmap / timeline visualizations (separate future wave if requested); saved filter presets (deferred); bulk-action affordances on the Tasks page.

---

### Task 3 — Task-row click opens `<TaskDetailsPanel>` + project-name tooltip

**Commit:** `feat(wave-33): wire task-row click to details panel on Tasks page + project-name tooltip on title hover`

1. **Click → details panel** (`src/pages/TasksPage.tsx`):
   - Replace `onTaskClick={handleNoop}` with a real handler that mirrors `Project.tsx:346-349`: set a `selectedTask` state, render `<TaskDetailsPanel task={selectedTask} onClose={...} />` alongside the list.
   - Match Project.tsx's layout pattern — side-by-side split when panel is open (on desktop), full-width sheet on mobile if Project.tsx does that. Read Project.tsx and mirror its breakpoint decisions; don't invent a new responsive strategy.
   - Preserve the list's scroll position when the panel opens and closes.
   - When a filter changes and the selected task is no longer in the filtered list, keep the panel open (user may want to remove the filter, not lose the selection). Close the panel explicitly via its onClose.

2. **Project-name tooltip on task title** (`src/features/tasks/components/TaskItem.tsx`):
   - Wrap the task title text in `<Tooltip>` / `<TooltipTrigger>` / `<TooltipContent>` from Task 1's primitive.
   - Tooltip content: the task's parent project's title. For tasks that already live under a project, this is `rootTask.title` (if the tree root is already loaded) or a lookup through the cached query. Use the existing data path — don't add a new query.
   - For tasks without a parent project (should only happen for standalone template edits; most users never see this): hide the tooltip (render no `<Tooltip>` wrapper, not an empty one). Don't display "—" or "No project".
   - Localization: only a dynamic string (the project title itself), no key needed.

3. **A11y**: the details panel must receive focus when it opens (existing Project.tsx behavior — copy it). The tooltip is purely hover/focus-reveal; don't add extra ARIA beyond what Radix provides.

4. **Tests**:
   - `Testing/unit/pages/TasksPage.test.tsx` — extend or NEW. Assert: clicking a task row opens the details panel with the task's title visible; clicking close hides the panel; hovering a task title reveals the project name in the tooltip.
   - Don't re-test TaskDetailsPanel internals (existing coverage on Project.tsx side owns that).

**DB migration?** No.

**Out of scope:** keyboard-navigation polish (arrow keys to move selection) — file a follow-up if it matters; right-click context menu on task rows; multi-select.

---

## Documentation Currency Pass (mandatory — before review)

1. **`spec.md`** — flip the new §3.6 bullet "Unified Task List View" to `[x]`. Bump spec version. Update `Last Updated`.
2. **`docs/AGENT_CONTEXT.md`** — update Routes (remove `/daily`); mention the new tooltip primitive under shared UI; golden-path bullet: "Tasks view (Wave 33) — unified screen, filter rail + due-date range, task-row click opens `<TaskDetailsPanel>`, hover tooltip reveals parent project name."
3. **`docs/dev-notes.md`** — append: "**Resolved (Wave 33)**: `/daily` route merged into `/tasks`; date-badge display unified; task-click opens details panel on both Project and Tasks pages."
4. **`repo-context.yaml`** — bump `wave_status.current` to `Wave 33 (Unified Tasks View)`, update `last_completed`, `spec_version`, add `wave_33_highlights:` block.
5. **`CLAUDE.md`** — update the Routes section: remove `/daily`, note the `/tasks` unification.

Land docs as `docs(wave-33): documentation currency sweep`.

## Wave Review (mandatory — before commit + push to main)

1. **Unified view loads** — `/tasks` renders the filter rail + due-date range picker + list with due-date badges.
2. **`/daily` redirects** — navigating to `/daily` (typed or bookmarked) lands on `/tasks` without a 404 flash.
3. **Badges match Daily parity** — a task due today shows "Today" in the old daily-view color; overdue shows red; due-soon shows orange.
4. **Filtering** — cycle every filter (status + date range); results are correct; URL reflects the filter state (if the codebase already does URL sync).
5. **Click → panel** — clicking any task row opens `<TaskDetailsPanel>` on the right; content matches the Project view's panel exactly.
6. **Tooltip** — hovering a task title for 300ms reveals the parent project name.
7. **No FSD drift** — Task 1 primitive in `shared/ui/`; Task 2 badge logic in `shared/lib/date-engine/`; Task 3 wiring stays in `pages/` and `features/tasks/`. No shared/ → features/ imports.
8. **Type drift** — `npm run build` green.
9. **Test-impact reconciled** — `DailyTasks.test.tsx` deleted (not skipped); no broken imports; test count ≥ baseline + new tests.
10. **Lint + build + tests** — green per `.claude/wave-execution-protocol.md` §4 (HALT on any failure).

## Commit & Push to Main (mandatory — gates Wave 34)

After all three Tasks merge:
1. `git checkout main && git pull && npm install && npm run lint && npm run build && npx vitest run`.
2. History should show: 3 task commits + 1 docs sweep commit on top of Wave 32.
3. Push to `origin/main`. CI green.
4. **Do not start Wave 34** until the above is true.

## Verification Gate (per task, before push)

**Every command below is a HALT condition per `.claude/wave-execution-protocol.md` §4.**

```bash
npm run lint      # 0 errors required (≤7 pre-existing warnings tolerated). FAIL → HALT.
npm run build     # clean (tsc -b && vite build). FAIL → HALT.
npm test          # 100% pass rate; count ≥ baseline + new tests. FAIL → HALT.
git status        # clean
```

Manual smoke per Wave Review.

## Key references

- `CLAUDE.md` — conventions, commands, architecture overview
- `.gemini/styleguide.md` — strict typing, FSD boundaries, Tailwind constraints
- `src/pages/DailyTasks.tsx` — Task 2: date-badge source of truth; delete after porting
- `src/pages/TasksPage.tsx` — Task 2 + 3: primary surface
- `src/pages/Project.tsx` — Task 3: `<TaskDetailsPanel>` integration pattern to mirror
- `src/features/tasks/components/TaskItem.tsx` — Tasks 2 + 3: badge + tooltip host
- `src/shared/ui/popover.tsx` — Task 1: Shadcn wrapper pattern to follow

## Critical Files

**Will edit:**
- `src/app/App.tsx` (TooltipProvider wrap, `/daily` route removal + redirect)
- `src/pages/TasksPage.tsx` (filter-bar extension, click wiring, panel mount)
- `src/features/tasks/components/TaskItem.tsx` (due-date badge, title tooltip)
- `src/features/tasks/hooks/useTaskFilters.ts` (date-range predicate)
- `src/features/tasks/components/TaskFilterBar.tsx` (or equivalent) (date-range inputs)
- `src/shared/i18n/locales/en.json` + `es.json` (new keys)
- `docs/AGENT_CONTEXT.md` (routes + shared UI)
- `spec.md`, `repo-context.yaml`, `docs/dev-notes.md`, `CLAUDE.md` (currency sweep)
- `package.json` (new dep: `@radix-ui/react-tooltip`)

**Will create:**
- `src/shared/ui/tooltip.tsx`
- `src/shared/lib/date-engine/formatTaskDueBadge.ts`
- Tests mirroring the source paths

**Will delete:**
- `src/pages/DailyTasks.tsx`
- `Testing/unit/pages/DailyTasks.test.tsx` (if it exists)

**Explicitly out of scope this wave:**
- Calendar heatmap / timeline
- Saved filter presets
- Bulk actions on the Tasks list
- Keyboard navigation between rows
- Multi-select

## Ground Rules (non-negotiable — from `CLAUDE.md` + `.gemini/styleguide.md`)

TypeScript-only; no `.js` / `.jsx`; no barrel files; path alias `@/` → `src/`; no raw date math (Task 2's badge formatter routes through `date-engine`); no direct `supabase.from()` in components; Tailwind utility classes only (no arbitrary values, no pure black — use `slate-900` / `zinc-900`); optimistic mutations must force-refetch on error; all user-visible strings through `t('namespace.key')`; atomic revertable commits; build + lint + tests all clean before every push.
