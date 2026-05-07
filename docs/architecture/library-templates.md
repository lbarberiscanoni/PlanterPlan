# docs/architecture/library-templates.md

## Domain Overview
The Library & Templates domain provides the administrative scaffolding for PlanterPlan. It encompasses reusable Project Templates, a standardized Master Library of tasks, and a centralized Resource Library, maintained exclusively by system Administrators.

> **Note — Two distinct "Resource Library" concepts exist:**
> 1. **Admin Resource Library** (this document): global external links/documents managed by Admins and attached to Master Library templates.
> 2. **Per-Project Resource Library** (`src/features/projects/components/ResourceLibrary.tsx`): a user-facing tab on each active project that aggregates all `task_resources` rows across the project's task tree. Standard project members can view it; resources are added/removed per-task via the Task Details panel.

## Core Entities & Data Models
* **Template:** A non-executable blueprint containing predefined Phase/Milestone/Task hierarchies.
* **Master Library Item:** A reusable object strictly tagged as `Phase`, `Milestone`, or `Task`. (Subtasks are invalid in the Master Library).
* **Resource:** A centralized external link or document reference.

## State Machines / Lifecycles
### Template Instantiation
1. **Selection:** User selects a template during Project Creation.
2. **Cloning:** The Master Template tree is recursively copied into a new Project ID instance.
3. **Date Resolution:** Relative `duration` and `days from start` are converted into hard ISO dates based on the user's `Target Launch Date`.

**User-testing tranche behavior (PR G):** template-to-project clone/import paths
do not copy template `notes` into instance rows. They preserve hierarchy, order,
`cloned_from_task_id`, root `project_kind`, and approved inherited behavior flags
(`is_coaching_task`, `is_strategy_template`) so project instances keep read-only
template behavior without inheriting editable template notes or unrelated
template settings.

## Business Rules & Constraints
* **Template UI Limitations:** Template items do *not* possess progress bars, status dropdowns, or Date Engine urgency states.
* **Master Library Strictness:**
  * Items created dynamically inside a Template are *not* automatically added to the Master Library. They must be explicitly promoted via UI action.
  * Instantiating a Master Library task into a project copies its data completely, allowing decoupled custom edits by the user.
  * **De-duplication (Wave 22):** after a successful `clone_project_template` RPC, `Task.clone` in `src/shared/api/planterClient.ts` stamps `settings.spawnedFromTemplate = <source_template_id>` onto the cloned root (non-fatal merge — a stamp failure never rolls back the clone). `useMasterLibrarySearch` accepts an `excludeTemplateIds` set and drops any result whose id is in the set; it also surfaces an `exclusionDrained` flag so the combobox can show "All matching templates are already in this project." when the full list was drained by exclusion. `TaskList.tsx` and `pages/Project.tsx` derive the exclude set from the already-loaded project hierarchy via the shared `collectSpawnedTemplateIds` helper in `src/shared/lib/tree-helpers.ts` — no extra round trip.
  * **Instance note isolation (PR G):** `clone_project_template` and inline project imports clear `notes` when creating `origin = 'instance'` rows from template data. Template-to-template clones retain notes for admin-maintained library work.
* **Creation Interface:** Adding new entities to templates triggers a dedicated modal form titled dynamically based on the entity type.

## Integration Points
* **Auth / RBAC:** The Master Library and Templates are invisible to standard App Users. Only Admin roles can View, Edit, or Mutate the library.
* **Projects:** Serves as the origin layer for `CreateProjectModal`.

## Known Gaps / Technical Debt

### Resolved

* **Versioning of templates (resolved Wave 36)**: `public.tasks.template_version int NOT NULL DEFAULT 1` (migration `docs/db/migrations/2026_04_18_template_versioning.sql`). BEFORE UPDATE trigger `trg_bump_template_version` increments the column on text / structural edits to `origin = 'template'` rows (title / description / days_from_start / duration / settings). `Task.clone` stamps `settings.cloned_from_template_version = source.template_version` on the cloned root. **Intentional non-propagation**: edits to a source template do NOT update existing instances — the architecture doc explicitly reserved that behavior, and Wave 36 only makes the version stamp trackable so admins can spot drift in `/admin/templates` (Admin Templates UI surfaces each instance's stamped version vs the source template's current version with a "stale" badge and copy explaining that existing projects are not auto-updated).

* **Cloned scaffold immutability (hardened PR 2)**: `clone_project_template` now stamps cloned-root provenance (`settings.spawnedFromTemplate`) and the source `template_version` during the insert path, before DB immutability applies. `trg_enforce_template_scaffold_immutability` then rejects app-role deletes and structural/content/protected-template-settings edits on `origin = 'instance' AND cloned_from_task_id IS NOT NULL` rows. Workflow state and runtime project configuration such as supervisor report delivery remain mutable; service-role/postgres maintenance bypasses are explicit and reserved for audited repair work.

### Active
* **Topically-related library suggestions (deferred):** Wave 22 shipped the "hide already-present templates" half of the §3.5 bullet. Surfacing templates *related to* the ones already in the project (recommender) stays in §6 Backlog.
* **Pre-Wave-22 clone backfill:** instances cloned before Wave 22 have no `settings.spawnedFromTemplate` stamp on their roots, so the Master Library combobox still lists them as "available" until re-cloned. A backfill migration wasn't worth it given how cheap re-cloning is and the stamp ships forward for every new clone.
