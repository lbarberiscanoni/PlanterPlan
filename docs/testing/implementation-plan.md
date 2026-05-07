# Testing Gap Analysis — Implementation Plan

> **Note (Phase 6 — File Reorganization):** All test files have been moved from `src/` to `Testing/`. Unit tests are under `Testing/unit/` (mirroring the `src/` structure), test utilities are in `Testing/test-utils/`, setup is at `Testing/setupTests.ts`, and E2E tests are in `Testing/e2e/`. The `@test` alias resolves to `Testing/test-utils/`. File paths in the original plan below reflect the pre-move locations.

## Context

PlanterPlan had **zero unit tests** when this historical plan was written, despite Vitest being fully installed and configured. The [`gap-findings.md`](gap-findings.md) audit (2026-03-24) identified 6 categories of E2E gaps against Notion requirements. Meanwhile, critical pure-logic modules (date-engine, tree-helpers, retry, payloadHelpers, pipelineMath, highlightMatches, export-utils) had no test coverage at all. This plan records the original phased approach that led to the current `Testing/` layout.

---

## Phase 0: Test Infrastructure Setup

### 0a. Add Vitest config to `vite.config.ts`

Add `test` block to the existing `vite.config.ts` (Vitest reads from Vite config automatically):

```ts
// Add to defineConfig:
test: {
  globals: true,
  environment: 'jsdom',
  setupFiles: './src/setupTests.ts',
  include: ['src/**/*.test.{ts,tsx}'],
  coverage: {
    provider: 'v8',
    include: ['src/shared/lib/**', 'src/shared/api/**', 'src/features/**/lib/**', 'src/features/**/hooks/**'],
    thresholds: { statements: 80 },
  },
},
```

**File**: `vite.config.ts`

### 0b. Add `/// <reference types="vitest/config" />` to vite.config.ts

Needed for TypeScript to recognize the `test` property in defineConfig.

### 0c. Create shared test utilities

**File**: `src/test-utils/factories.ts` — Task/Project factory using `@faker-js/faker`:
- `makeTask(overrides?)` → returns a minimal `TaskRow` stub
- `makeProject(overrides?)` → returns a minimal `Project` stub
- `makeTaskList(count, overrides?)` → returns flat array of tasks with parent relationships
- `makeTreeTasks(depth, breadth)` → returns flat array forming a tree hierarchy

**File**: `src/test-utils/supabase-mock.ts` — Mock for planterClient's Supabase calls:
- Mock `supabase.from().select/insert/update/delete` chain
- Mock `supabase.rpc()`

**File**: `src/test-utils/query-wrapper.tsx` — React Query test wrapper:
- Wraps components in `QueryClientProvider` with `retry: false`, `gcTime: 0`
- Exports `renderWithQueryClient()` helper

**File**: `src/test-utils/index.ts` — Re-export factories and mocks

---

## Phase 1: Pure Logic Unit Tests (Priority: HIGHEST)

These modules are pure functions with zero React/DOM dependencies — easiest to test, highest ROI.

### 1a. `src/shared/lib/date-engine/index.ts` (~40 tests)

**File to create**: `src/shared/lib/date-engine/index.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `resolve()` (internal, test via exports) | 3 | ISO string, Date object, null/invalid |
| `formatDate()` | 4 | Valid date+format, null input, invalid string, Date object |
| `isPastDate()` | 3 | Past date → true, today → false, future → false |
| `isTodayDate()` | 3 | Today → true, yesterday → false, null → false |
| `addDaysToDate()` | 3 | Positive days, negative days, null input |
| `isDateValid()` | 3 | Valid ISO, invalid string, null |
| `endOfDayDate()` | 2 | Sets to 23:59:59.999, null input |
| `isBeforeDate()` | 3 | Before → true, after → false, null inputs |
| `compareDateAsc()` | 4 | Less/greater/equal, nulls sort last |
| `compareDateDesc()` | 4 | Reverse of asc, nulls sort last |
| `findTaskById()` | 3 | Found, not found, null id |
| `calculateScheduleFromOffset()` | 5 | Normal offset, null parent, ancestor traversal, circular guard, missing start_date |
| `toIsoDate()` | 5 | YYYY-MM-DD passthrough, ISO timestamp, Date object, invalid, null |
| `formatDisplayDate()` | 4 | ISO timestamp (local), YYYY-MM-DD (UTC), null → "Not set", invalid |
| `calculateMinMaxDates()` | 4 | Normal children, empty array, null dates, single child |
| `recalculateProjectDates()` | 5 | Forward shift, backward shift, skips completed, no dates → skip, zero diff → empty |

### 1b. `src/shared/lib/date-engine/payloadHelpers.ts` (~20 tests)

**File to create**: `src/shared/lib/date-engine/payloadHelpers.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `parseDays()` (internal, test via constructors) | — | Covered implicitly |
| `constructUpdatePayload()` | 10 | Instance + days_from_start, instance + manual dates, manual overrides calculated, template (no date math), clear days + no manual, all nullables |
| `constructCreatePayload()` | 10 | Instance with offset, instance with manual dates, template origin, position calculation (maxPosition + POSITION_STEP), root_id passthrough, full form data |

### 1c. `src/shared/lib/tree-helpers.ts` (~22 tests)

**File to create**: `src/shared/lib/tree-helpers.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `buildTree()` | 8 | Flat→tree, sorts by position, orphan nodes go to roots, empty array, single node, deep nesting (5 levels), rootId filter, BFS depth traversal |
| `separateTasksByOrigin()` | 3 | Mixed origins, all instance, empty array |
| `updateTaskInTree()` | 3 | Update root node, update nested child, nonexistent ID (no-op) |
| `mergeTaskUpdates()` | 2 | Delegates to buildTree correctly |
| `updateTreeExpansion()` | 3 | Expands matching IDs, collapses non-matching, recursive into children |
| `mergeChildrenIntoTree()` | 3 | Replace children at target parent, nested parent, nonexistent parent (no-op) |

### 1d. `src/shared/lib/retry.ts` (~10 tests)

**File to create**: `src/shared/lib/retry.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `retry()` | 10 | Success on first try, success on retry, AbortError retried, status 503 retried, Postgres code '20' retried, network error retried, 400 fails fast, 401 fails fast, 404 fails fast, exhausts retries then throws |

Use `vi.useFakeTimers()` to avoid real delays.

### 1e. `src/features/dashboard/lib/pipelineMath.ts` (~12 tests)

**File to create**: `src/features/dashboard/lib/pipelineMath.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `bucketizeProjects()` | 4 | Multiple statuses, missing status → defaults to PLANNING, empty projects, unknown status |
| `groupTasksByProject()` | 3 | Multiple projects, null root_id → 'unassigned', empty |
| `groupMembersByProject()` | 3 | Normal grouping, null project_id, empty |
| `determineNewStatus()` | 4 | Column ID string match, project ID match, number overId (no match), unknown → null |

### 1f. `src/features/library/lib/highlightMatches.ts` (~10 tests)

**File to create**: `src/features/library/lib/highlightMatches.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `getHighlightSegments()` | 10 | Single match, multiple matches, case insensitive, no match, empty query, null text, special regex chars in query, match at start, match at end, adjacent matches |

### 1g. `src/features/projects/lib/export-utils.ts` (~6 tests)

**File to create**: `src/features/projects/lib/export-utils.test.ts`

| Function | Tests | Key Scenarios |
|----------|-------|---------------|
| `exportProjectToCSV()` | 6 | Generates correct headers, escapes quotes in title/description, task type detection (root/subtask/phase), empty tasks → no-op, null tasks → no-op, calls download mechanism |

Mock `document.createElement`, `URL.createObjectURL`, `document.body.appendChild/removeChild`.

**Phase 1 Total: ~120 unit tests**

---

## Phase 2: Hook Integration Tests (Priority: HIGH)

These require React Query wrapping and Supabase mocking. More setup but critical for confidence.

### 2a. Create React Query test wrapper

Uses the `src/test-utils/query-wrapper.tsx` from Phase 0c.

### 2b. `src/features/tasks/hooks/useTaskMutations.ts` (~12 tests)

**File to create**: `src/features/tasks/hooks/useTaskMutations.test.ts`

| Scenario | Tests |
|----------|-------|
| `createTask` mutation | 3 — success calls planterClient.Task.create, optimistic update adds to cache, error rollback |
| `updateTask` mutation | 3 — success calls planterClient.Task.update, optimistic update modifies cache, error rollback |
| `deleteTask` mutation | 3 — success calls planterClient.Task.delete, optimistic removal, error rollback |
| `toggleComplete` mutation | 3 — toggles is_complete + status, optimistic update, error rollback |

### 2c. `src/features/projects/hooks/useProjectMutations.ts` (~10 tests)

**File to create**: `src/features/projects/hooks/useProjectMutations.test.ts`

| Scenario | Tests |
|----------|-------|
| `createProject` | 3 — success, cache invalidation, error |
| `updateProject` | 3 — success, optimistic update, error rollback |
| `deleteProject` | 2 — success, cache invalidation |
| `updateProjectStatus` | 2 — status change, optimistic update |

### 2d. `src/features/tasks/hooks/useTaskQuery.ts` (~8 tests)

**File to create**: `src/features/tasks/hooks/useTaskQuery.test.ts`

| Scenario | Tests |
|----------|-------|
| Data fetching | 3 — returns task tree, per-section loading states, staleTime behavior |
| Tree building | 3 — calls buildTree correctly, separates by origin, handles empty |
| Error states | 2 — fetch error, partial failure |

### 2e. `src/features/dashboard/hooks/useProjectPipelineLogic.ts` (~6 tests)

**File to create**: `src/features/dashboard/hooks/useProjectPipelineLogic.test.ts`

| Scenario | Tests |
|----------|-------|
| Drag-drop status change | 3 — determines new status, calls mutation, optimistic reorder |
| Edge cases | 3 — drop on same column (no-op), invalid drop target, concurrent mutations |

**Phase 2 Total: ~36 hook tests**

---

## Phase 3: E2E Gap Coverage (from gap-findings.md)

### 3a. Hierarchy & Structural Invariants

**New feature file**: `e2e/features/project/subtask-hierarchy.feature`
**New/updated steps**: `e2e/steps/project.steps.ts`

Scenarios:
1. Create subtask under a task (5th level)
2. Verify subtask CRUD (create, read, update, delete)
3. Verify milestones are visible/expanded by default on project load
4. Negative: cannot transform a Phase into a Milestone (hierarchy invariant)

**Estimated: 4 scenarios, ~15 steps**

### 3b. Functional Logic & Automation

**New feature file**: `e2e/features/project/task-automation.feature`
**New/updated steps**: `e2e/steps/tasks.steps.ts`

Scenarios:
1. Mark parent complete → all children auto-marked complete
2. Child task due dates roll up to parent phase/milestone
3. Dependency prompt appears when completing task with outstanding dependents

**Estimated: 3 scenarios, ~12 steps**

### 3c. Roles & Account Management

**Updated feature file**: `e2e/features/auth/permission-enforcement.feature`
**New/updated steps**: `e2e/steps/permission.steps.ts`

Scenarios:
1. Coach role: can view all tasks, can only edit coaching-labeled tasks
2. Limited user: can only edit assigned tasks, cannot edit unassigned
3. (Signup confirmation and password recovery are auth-provider dependent — mark as manual/deferred)

**Estimated: 2 scenarios, ~10 steps**

### 3d. Library & Template Management

**New feature file**: `e2e/features/library/template-management.feature`
**New/updated steps**: `e2e/steps/library.steps.ts`

Scenarios:
1. Admin creates new template in master library
2. Admin edits existing template directly
3. Task shows "in-library" visual indicator
4. Add project task to library

**Estimated: 4 scenarios, ~16 steps**

### 3e. Phase Unlocking

**New feature file**: `e2e/features/project/phase-unlocking.feature`
**New/updated steps**: `e2e/steps/project.steps.ts`

Scenarios:
1. Complete all tasks in Phase 1 → Phase 2 unlocks
2. Incomplete Phase 1 → Phase 2 remains locked
3. Skip: "No Due Dates" mode deferred (not yet implemented per codebase)

**Estimated: 2 scenarios, ~8 steps**

**Phase 3 Total: ~15 new E2E scenarios across 4-5 feature files**

---

## Phase 4: API Layer Tests (Priority: MEDIUM)

### 4a. `src/shared/api/planterClient.ts` (~20 tests)

**File to create**: `src/shared/api/planterClient.test.ts`

Requires mocking Supabase client (`src/shared/db/client.ts`). Use `vi.mock()`.

| Area | Tests | Key Scenarios |
|------|-------|---------------|
| `Project.create()` | 3 | Creates root task, calls `initialize_default_project` RPC, returns project |
| `Project.getWithStats()` | 2 | Joins members/tasks counts, handles missing project |
| `Task.create/update/delete` | 4 | CRUD operations call correct Supabase methods |
| `Task.clone()` | 3 | Calls `clone_project_template` RPC with correct args, date shifting params |
| `Task.updateParentDates()` | 3 | Fetches children, calls calculateMinMaxDates, updates parent |
| `TaskResource.setPrimary()` | 2 | Sets primary flag, unsets others |
| `rpc()` wrapper | 3 | Delegates to supabase.rpc, retry wrapping, error propagation |

**Phase 4 Total: ~20 tests**

---

## Additional Gaps Discovered During Analysis

Beyond `gap-findings.md`, the following gaps were identified:

### A. Reporting Analytics Logic
- `src/features/projects/hooks/useProjectReports.ts` (97 LOC) — completely untested
- Reports feature files (`reports-display.feature`, `reports-selector.feature`) exist but cover display only, not data correctness
- **Recommendation**: Add unit tests for `useProjectReports` in Phase 2 extension (~4 tests)

### B. Realtime Subscription Logic
- `src/features/projects/hooks/useProjectRealtime.ts` (68 LOC) — untested
- E2E has `realtime-updates.feature` but unit-level subscription setup/teardown untested
- **Recommendation**: Add unit tests verifying channel subscribe/unsubscribe lifecycle (~4 tests)

### C. Settings Hook
- `src/features/settings/hooks/useSettings.ts` (91 LOC) — untested mutation logic
- E2E has `profile-settings.feature` but optimistic update logic untested at unit level
- **Recommendation**: Add to Phase 2 extension (~3 tests)

### D. Team Hook
- `src/features/people/hooks/useTeam.ts` (63 LOC) — member CRUD untested at unit level
- **Recommendation**: Add to Phase 2 extension (~3 tests)

### E. AuthContext
- `src/shared/contexts/AuthContext.tsx` (162 LOC) — session hydration, role loading, sign in/out untested
- **Recommendation**: Add integration tests verifying auth state transitions (~6 tests)

### F. Missing E2E for Reporting Export
- `gap-findings.md` notes CSV/PDF export is missing from E2E
- `export-csv.feature` exists but only covers basic CSV; PDF and automated email reports not covered
- **Recommendation**: Extend `export-csv.feature` once PDF export is implemented; add E2E scenario for report page chart rendering

---

## Summary: Test Counts & File Map

| Phase | New Test Files | Approx Tests | LOC Covered |
|-------|---------------|-------------|-------------|
| 0 — Infrastructure | 4 utility files + vite.config change | — | — |
| 1 — Pure Logic | 7 test files | ~120 | ~890 LOC |
| 2 — Hooks | 5 test files | ~36 | ~530 LOC |
| 3 — E2E Gaps | 4-5 feature files + step updates | ~15 scenarios | E2E coverage |
| 4 — API Layer | 1 test file | ~20 | ~616 LOC |
| **Total** | **17-18 new files** | **~176 unit + ~15 E2E** | **~2,036 LOC** |

### Current file locations (after Phase 6 reorganization):
```
Testing/test-utils/factories.ts
Testing/test-utils/query-wrapper.tsx
Testing/test-utils/index.ts
Testing/setupTests.ts
Testing/unit/shared/lib/date-engine/index.test.ts            (Phase 1a)
Testing/unit/shared/lib/date-engine/payloadHelpers.test.ts    (Phase 1b)
Testing/unit/shared/lib/tree-helpers.test.ts                  (Phase 1c)
Testing/unit/shared/lib/retry.test.ts                         (Phase 1d)
Testing/unit/features/dashboard/lib/pipelineMath.test.ts      (Phase 1e)
Testing/unit/features/library/lib/highlightMatches.test.ts    (Phase 1f)
Testing/unit/features/projects/lib/export-utils.test.ts       (Phase 1g)
Testing/unit/features/tasks/hooks/useTaskMutations.test.ts    (Phase 2b)
Testing/unit/features/projects/hooks/useProjectMutations.test.ts (Phase 2c)
Testing/unit/features/tasks/hooks/useTaskQuery.test.ts        (Phase 2d)
Testing/unit/features/dashboard/hooks/useProjectPipelineLogic.test.ts (Phase 2e)
Testing/unit/shared/api/planterClient.test.ts                 (Phase 4a)
Testing/e2e/features/project/subtask-hierarchy.feature        (Phase 3a)
Testing/e2e/features/project/task-automation.feature          (Phase 3b)
Testing/e2e/features/library/template-management.feature      (Phase 3d)
Testing/e2e/features/project/phase-unlocking.feature          (Phase 3e)
Testing/e2e/features/auth/permission-enforcement.feature      (Phase 3c)
Testing/e2e/steps/permission.steps.ts                         (Phase 3c)
Testing/e2e/steps/project.steps.ts                            (Phase 3a, 3e)
Testing/e2e/steps/tasks.steps.ts                              (Phase 3b)
Testing/e2e/steps/library.steps.ts                            (Phase 3d)
```

---

## Verification

1. **After Phase 0**: `npm test` runs without errors (0 tests found, 0 failures)
2. **After Phase 1**: `npm test` → all ~120 pure logic tests pass; `npm run build` still succeeds
3. **After Phase 2**: `npm test` → all ~156 tests pass (120 + 36 hooks)
4. **After Phase 3**: `npm run test:e2e` → new E2E scenarios pass against running dev server
5. **After Phase 4**: `npm test` → all ~176 tests pass
6. **Coverage check**: `npx vitest --coverage` → shared/lib/ at 90%+, hooks at 70%+
7. **CI**: Ensure `npm test` is added to CI pipeline (currently `npm run build` is the gate)

### Execution order recommendation:
Start with Phase 0 + Phase 1 (infrastructure + pure logic) as a single PR — this gives maximum safety net with minimum complexity. Phase 2-4 can follow as separate PRs.
