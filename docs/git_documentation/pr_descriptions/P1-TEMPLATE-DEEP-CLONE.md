# PLANTERPLAN PR DESCRIPTION TEMPLATE
# (USE THIS EXACT STRUCTURE)

## 0. Overview (TL;DR, 2–4 bullets)

- Implemented `deepCloneTask` service to recursively fetch and clone a template task tree.
- Created `src/utils/treeHelpers.js` to handle tree traversal, ID regeneration, and structure preservation.
- Added `fetchTaskChildren` to `taskService.js` to support recursive fetching.
- Added comprehensive unit tests for both the tree cloning logic and the service integration.

---

## 1. Roadmap alignment

### 1.x Roadmap item: P1-TEMPLATE-DEEP-CLONE - Template Deep Copy Engine

- **Phase/milestone:** Phase 1: Master Library & Deep Copy
- **Scope in this PR:** Implemented the core logic for deep cloning templates.
- **Status impact:** In progress -> Complete
- **Linked tickets:** None

---

## 2. Changes by roadmap item

### 2.x P1-TEMPLATE-DEEP-CLONE - Template Deep Copy Engine

**A. TL;DR (1–2 sentences)**
- Implemented the backend logic to recursively clone a task and its descendants, generating new UUIDs for each node while preserving the hierarchy.

**B. 5W + H**

- **What changed:**
  - `src/utils/treeHelpers.js`: Added `deepCloneTaskTree` and `flattenTaskTree`.
  - `src/services/taskService.js`: Added `fetchTaskChildren` and `deepCloneTask`.
  - `src/utils/treeHelpers.test.js`: Added unit tests for tree helpers.
  - `src/services/taskService.test.js`: Added unit tests for new service methods.

- **Why it changed:**
  - **Deep Copy**: The "Copy Template" feature requires a way to duplicate a template task and all its subtasks/milestones into a new project structure.
  - **Logic Separation**: Tree traversal logic was separated into `treeHelpers.js` for testability and reuse.

- **How it changed:**
  - `deepCloneTask` fetches the root task, then recursively fetches children using `fetchTaskChildren`.
  - `deepCloneTaskTree` traverses the fetched nodes, generates new IDs using `crypto.randomUUID`, and rebuilds the tree.
  - `flattenTaskTree` converts the cloned tree back into a flat array for potential batch insertion (or just returning to UI).

- **Where it changed:**
  - `src/utils/treeHelpers.js` (NEW)
  - `src/services/taskService.js`
  - `src/utils/treeHelpers.test.js` (NEW)
  - `src/services/taskService.test.js`

- **When (roadmap):**
  - Phase 1: Master Library & Deep Copy.

**C. Touch points & citations**

- `src/utils/treeHelpers.js`: L1-L75 -> Core recursive cloning logic.
- `src/services/taskService.js`: L183-L216 -> Service integration and data fetching.

**D. Tests & verification**

- **Automated tests:**
  - `src/utils/treeHelpers.test.js`: Verified single node cloning, recursive children cloning, and parent ID updates.
  - `src/services/taskService.test.js`: Verified `fetchTaskChildren` query construction and `deepCloneTask` integration (mocking DB and crypto).
  - Ran `npm test`.

- **Manual verification:**
  - Relied on unit tests as this is a backend logic change without UI wiring yet.

- **Known gaps / follow-ups:**
  - UI integration will be handled in `P1-UI-COPY-WIRING`.

**E. Risk & rollback**

- **Risk level:** Low
- **Potential impact if broken:**
  - Deep clone might fail or produce incorrect trees (e.g. missing children, wrong parent IDs).
  - Existing functionality is unaffected as this is new code.

- **Rollback plan:**
  - Revert this PR.

---

## 3. Cross-cutting changes (if any)

- None.

---

## 4. Implementation notes for reviewers (optional)

- `deepCloneTask` returns a **flat array** of the new tasks. This is intended to make it easier to insert them into the database (e.g. via `upsert` or batch insert) or to manage them in the UI state before saving.
- `crypto.randomUUID` is used for ID generation. A fallback is provided for environments where it might be missing (though modern browsers/Node support it).

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
