# PLANTERPLAN PR DESCRIPTION TEMPLATE
# (USE THIS EXACT STRUCTURE)

## 0. Overview (TL;DR, 2–4 bullets)

- Implemented `fetchTaskById` in `taskService.js` to support fetching single tasks by ID from `view_master_library`.
- Added unit tests for `fetchTaskById`, covering success, not-found, error, and invalid data scenarios.
- Mocked `supabaseClient` in tests to remove environment variable dependencies in the test runner.

---

## 1. Roadmap alignment

### 1.x Roadmap item: P1-HELPER-LOOKUP - Template Data Lookup

- **Phase/milestone:** Phase 1: Master Library & Deep Copy
- **Scope in this PR:** Implemented the utility function to fetch full task details from the master library, a prerequisite for the deep copy operation.
- **Status impact:** Not started -> Complete
- **Linked tickets:** None (not tracked in external issue system)

---

## 2. Changes by roadmap item

### 2.x P1-HELPER-LOOKUP - Template Data Lookup

**A. TL;DR (1–2 sentences)**  
- Added `fetchTaskById` to retrieve a single task from `view_master_library` and validated the response shape, with tests and supabase mocking to support reliable usage.

**B. 5W + H**

- **What changed:**  
  Added a new export `fetchTaskById` in `taskService.js` that queries Supabase for a specific task ID and returns a validated task object.

- **Why it changed:**  
  The "Deep Copy" feature (P1-TEMPLATE-DEEP-CLONE) needs to fetch the source template task details before cloning, which requires a reliable single-task lookup.

- **How it changed:**  
  Used Supabase `.eq("id", taskId).single()` query method, added error handling for `PGRST116` (not found), and validated responses using `validateTaskShape`. Updated tests to mock `supabaseClient` and cover success, not-found, error, and invalid shape scenarios.

- **Where it changed:**  
  `src/services/taskService.js` and `src/services/taskService.test.js`.

- **When (roadmap):**  
  Phase 1: Master Library & Deep Copy (P1-HELPER-LOOKUP considered complete for helper lookup).

**C. Touch points & citations**

- `src/services/taskService.js`: L147–178 -> Added `fetchTaskById` function.
- `src/services/taskService.test.js`: L1–5 -> Updated imports and mocked `supabaseClient`.
- `src/services/taskService.test.js`: L14–16 -> Added `eq` and `single` mocks to `createMockClient`.
- `src/services/taskService.test.js`: L94–142 -> Added test suite for `fetchTaskById`.

**D. Tests & verification**

- **Automated tests:**  
  - Updated `src/services/taskService.test.js`.  
  - Added tests for: ID exists, ID missing (returns null or not-found), network/error cases, and invalid data shape.  
  - Command: `npm test src/services/taskService.test.js`.

- **Manual verification:**  
  - None (backend utility only, covered by unit tests).

- **Known gaps / follow-ups:**  
  - None.

**E. Risk & rollback**

- **Risk level:** Low
- **Potential impact if broken:**  
  - `fetchTaskById` is a new function; existing functionality is unaffected. Future features that depend on this helper (e.g. deep copy) would fail or misbehave if this is broken.

- **Rollback plan:**  
  - Revert this PR.

---

## 3. Cross-cutting changes (if any)

- None.

---

## 4. Implementation notes for reviewers (optional)

- `fetchTaskById` intentionally queries `view_master_library` because the initial use case is fetching template tasks, not arbitrary user tasks.
- The `supabaseClient` mock is necessary because `createClient` throws immediately when required env vars are missing in the test environment. The mock ensures tests are deterministic and do not depend on env configuration.

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
