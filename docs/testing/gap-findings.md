# Testing Gap Findings (Thorough & SSoT Pass)

> **Note:** E2E tests have been relocated to `Testing/e2e/`. References to `e2e/` below reflect the original pre-reorganization paths.
> **Release-hardening update (2026-05-09):** The original tables are historical
> audit output, not the current release gate. Current CI runs dependency
> guardrails, architecture verification, lint, unit tests, pgTAP DB tests,
> build, and `npm run test:e2e:release`.

This document provides a granular log of discrepancies between the comprehensive requirements and the current E2E test suite in `Testing/e2e/features/`.

## Current Release-Hardening Status

| Area | Current status | Evidence |
| --- | --- | --- |
| Hierarchy and structural invariants | Covered for release-critical paths. Subtask CRUD remains in legacy E2E, and max-depth/cycle invariants are enforced below the UI. | `Testing/e2e/features/project/subtask-hierarchy.feature`, `Testing/e2e/features/release/critical-regressions.feature`, `supabase/tests/pgtap_task_hierarchy_depth.sql`, `Testing/unit/features/tasks/lib/task-hierarchy.test.ts` |
| Completion, rollups, phase unlock, and date envelopes | Covered by release smoke plus DB characterization. Date-kind scheduling uses the documented business-calendar path; ICS all-day `DTEND` keeps calendar-day rendering. | `Testing/e2e/features/release/critical-regressions.feature`, `supabase/tests/pgtap_completion_rollups.sql`, `supabase/tests/pgtap_task_date_envelope.sql`, `Testing/unit/shared/lib/date-engine/business-calendar.test.ts` |
| Roles, RBAC, and account lifecycle | Release-critical role-denied paths, coach progress-only scope, invite ownership, account deletion, and admin moderation are covered below the UI. External email confirmation remains provider/manual validation. | `supabase/tests/pgtap_task_role_matrix.sql`, `supabase/tests/pgtap_coach_rbac.sql`, `supabase/tests/pgtap_account_lifecycle.sql`, `supabase/tests/pgtap_admin_moderation.sql`, `Testing/unit/shared/api/planterClient.test.ts` |
| Library and template hardening | Template scaffold immutability, clone provenance, stale-version visibility, template authoring gates, and direct template workflows are covered. | `supabase/tests/pgtap_template_scaffold_immutability.sql`, `supabase/tests/pgtap_template_stale_consistency.sql`, `Testing/e2e/features/library/template-management.feature`, `Testing/unit/pages/admin/AdminTemplates.test.tsx` |
| Reporting and export | CSV export and the launch-safe Gantt browser-print path are covered. A server-side PDF pipeline is not implemented and is not a release blocker. | `Testing/e2e/features/project/export-csv.feature`, `Testing/e2e/features/accessibility/aria-basics.feature`, `Testing/unit/features/projects/lib/export-utils.test.ts`, `Testing/unit/features/gantt/components/ProjectGantt.test.tsx` |
| Mobile and accessibility release flows | Critical mobile navigation, non-drag task movement, keyboard navigation, and ARIA/export flows have dedicated release checks. | `npm run test:e2e:mobile`, `npm run test:e2e:a11y`, `Testing/e2e/features/mobile/`, `Testing/e2e/features/accessibility/aria-basics.feature` |

Remaining historical gaps should be re-opened only when they map to an
implemented product surface. For example, signup email confirmation depends on
Supabase email delivery configuration, "No Due Dates" mode is not a shipped
surface, and the removed dashboard/pipeline board should not receive new tests.

## 1. Hierarchy & Structural Invariants

| Requirement (Notion)     | E2E Status | Notes                                                                                                                  |
| ------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| **5-Level Hierarchy** | 🔴 Missing | Notion: `Project -> Phase -> Milestone -> Task -> Subtask`. E2E lacks explicit tests for **Subtask** nesting and CRUD. |
| **Hierarchy Invariants** | 🔴 Missing | No negative tests for logic preventing Phase -> Milestone transformations, etc.                             |
| **Default View State** | 🔴 Missing | Notion: "every milestone is visible and expanded" by default on project load.                                          |

## 2. Functional Logic & Automation

| Requirement (Notion)   | E2E Status | Notes                                                                                         |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| **Auto-Mark Children** | 🔴 Missing | "Auto-mark all children complete when parent marked complete".                                |
| **Date Rollups** | 🔴 Missing | "Phase/milestone due dates based on child task due dates".                                    |
| **Auto-Date Shifting** | 🟡 Partial | E2E has some recalculation warnings, but lacks deep verification of automated shifts via DND. |
| **Dependency Prompts** | 🔴 Missing | Confirmation prompt when completing tasks with outstanding dependents.                        |

## 3. Roles & Account Management

| Requirement (Notion)            | E2E Status | Notes                                                                 |
| ------------------------------- | ---------- | --------------------------------------------------------------------- |
| **Coach Role Permissions** | 🔴 Missing | "View any, edit only coaching-labeled tasks".                         |
| **Limited User Edit Exception** | 🔴 Missing | Verification that Limited Users can edit _only_ their assigned tasks. |
| **Signup Confirmation** | 🔴 Missing | Verification of the email link confirmation flow.                     |
| **Password Recovery** | 🔴 Missing | "Forgot password" flow is entirely untested in E2E.                   |

## 4. Reporting & Analytics

| Requirement (Notion)  | E2E Status | Notes                                                          |
| --------------------- | ---------- | -------------------------------------------------------------- |
| **Advanced Reports** | 🔴 Missing | Monthly reports, Progress charts for Phases (Donut charts).    |
| **Automation/Export** | 🔴 Missing | Downloadable (CSV/PDF) and Automated Emailable status reports. |

## 5. Library & Template Management (Admin)

| Requirement (Notion)      | E2E Status | Notes                                                                           |
| ------------------------- | ---------- | ------------------------------------------------------------------------------- |
| **Resource Library CRUD** | 🔴 Missing | Admin ability to create/manage the global resource library.                     |
| **Master Library CRUD** | 🔴 Missing | Ability to add project tasks to library or create library-only tasks.           |
| **In-Library Indicator** | 🔴 Missing | Visual feedback in task details that a task exists in the Master Library.       |
| **Direct Template Edit** | 🔴 Missing | E2E only tests creation _from_ templates, not editing the templates themselves. |

## 6. Alternate Architecture

| Requirement (Notion)  | E2E Status | Notes                                        |
| --------------------- | ---------- | -------------------------------------------- |
| **Phase Unlocking** | 🔴 Missing | "Next Phase unlocks when previous complete". |
| **No Due Dates Mode** | 🔴 Missing | Interface option to omit dates.              |

---

## 7. Architectural SSoT Gaps (Phase 7 Priorities)
These gaps represent critical architectural invariants defined in `docs/architecture/` that are currently lacking explicit E2E verification.

### 7.1 Task Depth Invariant (Tasks & Subtasks Domain)
* **The Gap:** The SSoT strictly dictates a Maximum Subtask Depth of 1 (`docs/architecture/tasks-subtasks.md`). The current Playwright suite lacks specific collision-detection tests verifying that the UI rejects dropping tasks into sub-subtask configurations.
* **Risk:** Users could bypass UI constraints, creating deeply nested trees that break the database `tasks_with_primary_resource` views and standard recursive aggregations.

### 7.2 Date Engine Temporal Bounds (Date Engine Domain)
* **The Gap:** SSoT identifies technical debt where the Date Engine fails to skip weekends/regional holidays. Furthermore, boundary constraints (ensuring a subtask cannot be dragged to a date outside its parent's envelope) lack explicit Playwright verification.
* **Risk:** Visual desyncs where child objects float outside parent UI containers on the Gantt/Timeline views. Tests must be written to expose weekend-skipping failures gracefully until the algorithm is updated.

### 7.3 Template Immutability (Projects & Phases Domain)
* **The Gap:** SSoT notes that items originating from a Master Template (`origin = 'template'`) should be immutable against structural deletion by standard users in an active project (allowing deletion only for custom post-instantiation additions).
* **Risk:** Users accidentally delete foundational template scaffolding, breaking the intended Roadmap flow. Tests do not currently validate this specific protection lock.

### 7.4 Coach Role Tagging (Auth & RBAC Domain)
* **The Gap:** The RBAC matrix dictates Coaches can only edit "Coaching tasks". There is no test validating the tag-checking logic that enables/disables the `TaskForm` fields for a Coach session.
* **Risk:** Privilege escalation where Coaches accidentally modify core structural tasks.

**Log Date**: 2026-04-13  
**Analysis Baseline**: 18 E2E feature domains in `Testing/e2e/features/` & `docs/architecture/` SSoT
