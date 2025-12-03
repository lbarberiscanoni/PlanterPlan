# PlanterPlan Roadmap

Project roadmap for PlanterPlan, optimized for high parallelism via **component isolation**, **layer separation**, and **interface-first design**.

**Granularity Goal:** Each item should be reviewable/verifiable within **1 hour**.

---

## Phase 0: Foundation & Standards (High Priority)

_Goal: Establish standards to prevent "ugly" merges later. No functionality changes._

### 0.1 Lint & Format Baseline

**ID:** `P0-LINT-BASE`

- **Description**: Lock in eslint/prettier config and apply a one-time formatting pass.
- **Depends on**: None
- **Touches**: `package.json`, `.eslintrc.json`, `src/**/*.js`
- **DoD**:
  - `npm run lint` passes without warnings.
  - Codebase formatted via Prettier.

### 0.2 Shared Data Shapes (JS/React Compatible)

**ID:** `P0-DATA-SHAPES`

- **Description**: Create central PropTypes definitions instead of using TypeScript (avoids build config changes).
- **Depends on**: `P0-LINT-BASE`
- **Touches**: `src/utils/shapes.js` (New File)
- **DoD**:
  - `TaskShape`, `ProjectShape`, `UserShape` exported.
  - Used in `TaskItem.jsx` to verify.

---

## Phase 1: Master Library & Deep Copy (High Parallelism)

_Goal: Complete the "View" vs "Copy" flows. The "Deep Clone" logic is critical here._

### 1.1 Search Component Logic

**ID:** `P1-SEARCH-LOGIC`

- **Description**: Add `mode` prop to Search to handle 'view' vs 'copy' actions differently.
- **Depends on**: `P0-DATA-SHAPES`
- **Touches**: `src/components/tasks/MasterLibrarySearch.jsx`
- **DoD**:
  - Component accepts `mode="view" | "copy"`.
  - Renders "View" button vs "Copy" button based on mode.

### 1.2 Template Data Lookup

**ID:** `P1-HELPER-LOOKUP`

- **Description**: Utility to fetch full task details from context/service for the copy operation.
- **Depends on**: None
- **Touches**: `src/services/taskService.js`
- **DoD**:
  - `fetchTaskById(id)` implemented and verified.

### 1.3 Template Deep Copy Engine (Logic Layer)

**ID:** `P1-TEMPLATE-DEEP-CLONE`

- **Description**: Service method to recursively fetch a template Task + all valid descendants (Subtasks, Milestones) and prepare them for insertion.
- **Depends on**: `P1-HELPER-LOOKUP`
- **Parallel with**: `P2-SVC-MEMBERSHIPS`
- **Touches**: `src/services/taskService.js`, `src/utils/treeHelpers.js` (New)
- **DoD**:
  - `deepCloneTaskTree(rootId)` returns a nested object tree with new UUIDs.
  - Preserves relative dates and dependencies within the tree.
  - **Tests**: Unit test verifying a Phase copy includes its Milestones.

### 1.4 Copy Mode Integration (UI Layer)

**ID:** `P1-UI-COPY-WIRING`

- **Description**: Connect the Search component in the Task Form to the Deep Clone engine.
- **Depends on**: `P1-TEMPLATE-DEEP-CLONE`, `P1-SEARCH-LOGIC`
- **Touches**: `src/components/tasks/NewTaskForm.jsx`
- **DoD**:
  - Clicking "Copy" on a search result populates the form (or auto-creates the tree).
  - Success notification upon completion.

---

## Phase 2: Team Management & Joined Projects (Max Parallelism)

_Goal: Securely allow users to view projects they are invited to._

### 2.1 Database RLS Policies

**ID:** `P2-DB-RLS-POLICIES`

- **Description**: Implement Row Level Security to allow reads on `tasks` if user is in `project_members`.
- **Depends on**: None (SQL only)
- **Touches**: Supabase Dashboard / `docs/db/policies.sql`
- **DoD**:
  - Policy `select_joined_projects`: Users can SELECT projects where their UID is in `project_members`.
  - Verified via Supabase SQL Editor (simulating a non-owner user).

### 2.2 Membership Service

**ID:** `P2-SVC-MEMBERSHIPS`

- **Description**: Fetch logic for joined projects.
- **Depends on**: `P2-DB-RLS-POLICIES`
- **Touches**: `src/services/projectService.js`
- **DoD**:
  - `getJoinedProjects(userId)` returns array of projects.
  - Handles empty states and errors gracefully.

### 2.3 Role Indicator UI

**ID:** `P2-UI-ROLE-INDICATOR`

- **Description**: Visual badge showing 'Owner' vs 'Editor'.
- **Depends on**: `P0-LINT-BASE`
- **Touches**:
  - `src/components/common/RoleIndicator.jsx`
  - `src/styles/components/role-indicator.css` (New)
- **DoD**:
  - Renders correct color/text based on prop.

### 2.4 Dashboard "Joined" Section

**ID:** `P2-UI-JOINED-SECTION`

- **Description**: Add "Joined Projects" section to Dashboard.
- **Depends on**: `P2-SVC-MEMBERSHIPS`
- **Touches**:
  - `src/components/tasks/TaskList.jsx`
  - `src/styles/pages/dashboard.css`
- **DoD**:
  - Displays joined projects separately from owned projects.
  - Clicking a joined project navigates to the View.

---

## Phase 3: Code Hygiene (Isolated Refactors)

_Goal: Clean up debt before the heavy Phase 4 logic._

### 3.1 Directory Cleanup

**ID:** `P3-CLEAN-DIRS`

- **Description**: Remove unused files and consolidate CSS imports.
- **Touches**: `src/styles/**`, `src/components/**`
- **DoD**:
  - No unused CSS files in `src/styles/`.
  - All components import their specific CSS files explicitly.

### 3.2 Test Coverage Spike

**ID:** `P3-TEST-UTILS`

- **Description**: Add unit tests for existing Date and Search utils.
- **Touches**: `src/utils/dateUtils.test.js`, `src/utils/highlightMatches.test.js`
- **DoD**:
  - 80%+ coverage on utility functions.

---

## Phase 4: The Date Engine & Drag-n-Drop (Sequential Core)

_Goal: Stable, conflict-free drag and drop with rollbacks._

### 4.1 Data Fixtures (Safety Net)

**ID:** `P4-DATA-FIXTURES`

- **Description**: Capture "Snapshot" JSONs of complex projects (nested phases, dependencies) to use as test cases.
- **Depends on**: None
- **Touches**: `src/tests/fixtures/complexProject.json`
- **DoD**:
  - JSON file containing a real project state exists.
  - Test runner can load this JSON.

### 4.2 Logic Extraction (Refactor)

**ID:** `P4-EXTRACT-LOGIC`

- **Description**: Move drag logic out of `TaskContext` into a custom hook.
- **Depends on**: `P4-DATA-FIXTURES`
- **Touches**: `src/hooks/useTaskDragDrop.js` (New)
- **DoD**:
  - `TaskContext` is smaller.
  - Drag logic works exactly as before (no regression).

### 4.3 Sparse Positioning & Rollback (The Fix)

**ID:** `P4-SPARSE-ROLLBACK`

- **Description**:
  1. Implement "Sparse" updates (calculate mathematical mid-point for position) to avoid re-indexing the whole list.
  2. Implement **Optimistic Rollback**: If DB sync fails, revert state immediately.
- **Depends on**: `P4-EXTRACT-LOGIC`
- **Touches**: `src/hooks/useTaskDragDrop.js`
- **DoD**:
  - Dragging updates only 1 row in DB (verified via Network tab).
  - **Rollback Test**: Manually fail a request; UI must snap back to original position.

### 4.4 Date Recalculation Fix

**ID:** `P4-DATE-RECALC`

- **Description**: Ensure date recalculation happens _after_ the move is confirmed, or is debounced.
- **Depends on**: `P4-SPARSE-ROLLBACK`
- **Touches**: `src/hooks/useTaskDates.js` (New)
- **DoD**:
  - Moving a Parent task recalculates Children dates correctly.
  - No "infinite loops" of updates.

---

## Phase 5: Reports & Resources (Feature Expansion)

_Goal: Add value-add features. Can run parallel to Phase 4 if resources allow._

### 5.1 Resource Filters

**ID:** `P5-RESOURCE-FILTERS`

- **Description**: Filter library by PDF vs URL vs Text.
- **Touches**:
  - `src/components/resources/ResourceList.jsx`
  - `src/styles/components/resource-filters.css`
- **DoD**: Filter buttons update the list view.

### 5.2 Monthly Report View

**ID:** `P5-REPORT-UI`

- **Description**: Read-only view for project status.
- **Touches**: `src/components/reports/MonthlyReport.jsx`
- **DoD**:
  - Renders project tasks filtered by selected month.
  - CSS `@media print` hides sidebars for PDF generation.
