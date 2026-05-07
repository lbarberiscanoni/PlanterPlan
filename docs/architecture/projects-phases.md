# docs/architecture/projects-phases.md

## Domain Overview
This domain defines the highest-level structural containers of the application. Projects group work into distinct lifecycles and strictly govern the hierarchical nesting of work.

## Core Entities & Data Models
* **Project:** The root container.
  * **Fields:** `Name`, `Target Launch Date`, `Date Range`, `Due soon time horizon`.
  * **Metrics:** Aggregated completeness percentage.
* **Phase:** Top-level structural grouping under a Project.
* **Milestone:** Secondary grouping under a Phase, acting as a collection of executable tasks.

## State Machines / Lifecycles
### Project Instantiation Lifecycle
1. **Creation:** Template tree cloned, textual data copied, dates/states mapped to `Target Launch Date`.
2. **Active:** Standard operation. Completing tasks triggers upward recalculation of Milestone and Project completeness.
3. **Deletion:** Triggers a cascading hard delete of all nested descendants and removes the project from navigation, task, report, and admin analytics surfaces.

### Checkpoint-Based Projects (Wave 29 — Implementation Complete)

**Discriminator**: `settings.project_kind: 'date' | 'checkpoint'` on root tasks (defaults to `'date'` when absent). CHECK constraint `tasks_project_kind_check` enforces the two-value vocabulary; absence-as-date keeps every pre-Wave-29 project un-migrated.

**Helpers**: `src/features/projects/lib/project-kind.ts` mirrors the coaching/strategy form-helper trio (`extractProjectKind`, `formDataToProjectKind`, `applyProjectKind`). Migration: `docs/db/migrations/2026_04_18_project_kind.sql`.

**Date-engine carve-out**: `recalculateProjectDates` short-circuits when the root is checkpoint (no bulk-shift on launch-date edits). `deriveUrgencyForProject` returns `'not_yet_due'` for any non-completed checkpoint task. `isCheckpointProject` is mirrored byte-equivalent in `supabase/functions/_shared/date.ts` (lock-step).

**Nightly-sync**: the overdue + due_soon urgency passes skip checkpoint projects via `loadRootInfo` (one combined root-settings query covers both passes). The recurrence pass is unaffected — templates are project-kind-agnostic.

**Phase unlock**: existing `check_phase_unlock` + `handle_phase_completion` triggers and `is_locked` / `prerequisite_phase_id` columns do all the unlocking work — Wave 29 did NOT modify them. What's new is the UI gating in checkpoint mode: locked phases visually communicate the lock state.

**Kind switching**: `date → checkpoint` is direct. `checkpoint → date` requires a Shadcn `<Dialog>` confirmation in `EditProjectModal` because re-engaging dates may surface overdue tasks. Date data is preserved across switches — no destructive operation.

**Donut visualization**: `PhaseCard.tsx` swaps its progress bar for a recharts `<PieChart>` donut (same pattern as `ProjectHeader.tsx`) when the project is checkpoint. Center label is `{progress}%` or `Locked` when `is_locked === true`. Brand-600 fill, slate-200 track (via CSS variables, not raw hex).

_Historical lifecycle summary:_
1. **Locked:** Subsequent phases are visually locked.
2. **Current:** Phase is active and tracking progress visually (Donut Chart) without strict Date Engine due dates.
3. **Unlocked:** A locked Phase transitions to "Current" strictly when the preceding Phase hits 100% completion (via `check_phase_unlock` trigger).

## Business Rules & Constraints
* **Strict Hierarchy Invariant:** `Project -> Phases -> Milestones -> Tasks -> Subtasks`.
* **Deprecation:** Project `Location` field is officially deprecated.

## Archive & Derived State Semantics
* **No manual lifecycle pipeline:** `/dashboard` and the drag/drop project
  pipeline were removed in PR D. Users no longer move projects through
  Planning / In Progress / Launched / Paused root-status columns.
* **Derived project state:** `deriveProjectState` in
  `src/features/projects/lib/derived-project-state.ts` derives the read-only
  project badge from child task state: archived, complete, in progress, not
  started, or empty.
* **Archived project:** Root task carries `status = 'archived'` (set/cleared via the Archive / Unarchive action in `EditProjectModal`). Archiving is reversible and **never cascades** to descendants — children keep their own status and continue to resolve dates normally.
* **Active project:** Any project root where `status !== 'archived'` **and** `is_complete !== true`. This is the default-visible set for `ProjectSidebar`, `ProjectSwitcher`, and project pickers.
* **Completed project:** Indicated by `is_complete = true` on the root task (and `status !== 'archived'`). Wave 23's `sync_task_completion_flags` DB trigger makes `is_complete === (status === 'completed')` an unconditional invariant (see `tasks-subtasks.md`); the `updateStatus` bubble-up logic keeps the value propagating up the tree. The UI filter inspects `is_complete` only.
* **No auto-archive:** Completing a project does not archive it; archive remains an explicit user action.
* **Reachable behind toggles (Wave 25):** `ProjectSwitcher` exposes two independent toggles — "Show archived" (Wave 21.5) and "Show completed" (Wave 25) — so users can navigate back to either subset without leaving the header dropdown. Toggles are independent: a project that is **both** archived **and** completed is classified as archived by the component's filters, and therefore appears only when "Show archived" is on. Defaults stay OFF; active behavior is unchanged.

## Integration Points
* **Reports & Analytics:** Reports and admin analytics query project/task completeness metrics without owning user-facing lifecycle state.
* **Date Engine:** Project settings define the bounds and horizons applied to all child elements.

## Known Gaps / Technical Debt
* **Template Immutability (resolved Wave 36, hardened PR 2)**: `public.tasks.cloned_from_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL` (migration `docs/db/migrations/2026_04_18_task_template_origin.sql`). Stamped server-side during `clone_project_template`; NULL means "post-instantiation custom addition" (freely deletable). PR 2 adds `trg_enforce_template_scaffold_immutability`, which blocks app-role deletes plus structural/content/protected-template-settings updates on cloned instance scaffold rows while still allowing runtime workflow fields such as status/completion, assignments, priority, dates, notes, primary resources, lock state, supervisor report delivery, and non-protected project settings. Explicit postgres/service-role maintenance bypass remains available for audited repair work. `TaskDetailsView` mirrors the DB rule by blocking delete attempts for all cloned template-origin rows. `TaskItem` renders a small indigo "T" badge (with a Wave 33 Radix tooltip reading "From template") on every template-origin row.
