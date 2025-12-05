# PLANTERPLAN PR DESCRIPTION TEMPLATE
# (USE THIS EXACT STRUCTURE)

## 0. Overview (TL;DR, 2–4 bullets)

- Updated `taskService.js` to query the `tasks` table directly (filtering by `origin="template"`) instead of using `view_master_library`.
- Enforced strict `origin="template"` constraint in `fetchTaskById` to prevent access to non-template tasks.
- Added flexbox and gap utility classes to `globals.css` to support UI layout needs.
- **Security Update**: Bumped `node-forge` to version 1.3.2 to address a security vulnerability.

---

## 1. Roadmap alignment

### 1.x Roadmap item: P1-HELPER-LOOKUP - Template Data Lookup

- **Phase/milestone:** Phase 1: Master Library & Deep Copy
- **Scope in this PR:** Refined the data access strategy for master library tasks and added necessary CSS utilities.
- **Status impact:** In progress -> Complete
- **Linked tickets:** None

---

## 2. Changes by roadmap item

### 2.x P1-HELPER-LOOKUP - Template Data Lookup

**A. TL;DR (1–2 sentences)**  
- Switched data fetching from `view_master_library` to the `tasks` table with strict `origin="template"` filter, and added CSS utilities.

**B. 5W + H**

- **What changed:**  
  - `taskService.js`: Changed `MASTER_LIBRARY_TABLE` to "tasks" and added `.eq("origin", "template")` to all master library queries, including `fetchTaskById`.
  - `globals.css`: Added `.flex-row`, `.flex-col`, `.flex-wrap`, and `.gap-*` utility classes.

- **Why it changed:**  
  - **Data Access**: Querying the `tasks` table directly provides more control. Strictly enforcing `origin="template"` ensures that master library helpers cannot leak user tasks.
  - **Styles**: Missing utility classes were needed for component layout adjustments.

- **How it changed:**  
  - Updated `fetchMasterLibraryTasks`, `searchMasterLibraryTasks`, and `fetchTaskById` to target the `tasks` table.
  - Added `.eq("origin", "template")` to the query chain in `fetchTaskById`.
  - Added CSS rules for flex direction and gap spacing in `globals.css`.

- **Where it changed:**  
  - `src/services/taskService.js`
  - `src/services/taskService.test.js` (updated expectations)
  - `src/styles/globals.css`

- **When (roadmap):**  
  - Phase 1: Master Library & Deep Copy.

**C. Touch points & citations**

- `src/services/taskService.js`: L3, L38, L103, L157 -> Changed table target and added filter.
- `src/styles/globals.css`: L98–L119 -> Added flex and gap utilities.

**D. Tests & verification**

- **Automated tests:**  
  - Updated `src/services/taskService.test.js` to verify queries target `tasks` table and include `origin="template"` filter.
  - Ran `npm test`.

- **Manual verification:**  
  - Verified tests pass.

- **Known gaps / follow-ups:**  
  - None.

**E. Risk & rollback**

- **Risk level:** Low
- **Potential impact if broken:**  
  - Master library fetching might fail or return incorrect data if the `tasks` table schema doesn"t match expectations (unlikely).

- **Rollback plan:**  
  - Revert this PR.

---

## 3. Cross-cutting changes (if any)

- **Type**: Security Update
- **Scope**: `package-lock.json`
- **Rationale**: Bumped `node-forge` from 1.3.1 to 1.3.2 to address a security vulnerability (cherry-picked from dependabot).
- **Touch points**:
  - `package-lock.json`: Updated `node-forge` version.

---

## 4. Implementation notes for reviewers (optional)

- The switch to the `tasks` table is a strategic decision to simplify data access.
- `fetchTaskById` now strictly enforces `origin="template"`. If a task exists but has a different origin, it will return `null` (or throw not found error depending on RLS/query result), effectively hiding non-template tasks from this helper.

---

## 5. Checklist

- [x] All changes are mapped to a roadmap item (from `roadmap.md`) or explicitly marked as cross-cutting
- [x] Touch points and line ranges added for each meaningful change hunk
- [x] TL;DR provided for each roadmap item
- [x] What / Why / How / Where / When (roadmap) documented
- [x] Automated tests added/updated where appropriate
- [x] Manual verification performed (or rationale if not)
- [x] Breaking changes, if any, are documented and communicated
- [x] Rollback plan is defined and feasible
- [x] Linked tickets (if any) are referenced and updated as needed
