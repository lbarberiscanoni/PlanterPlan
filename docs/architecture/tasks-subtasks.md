# docs/architecture/tasks-subtasks.md

## Domain Overview
This domain governs the atomic execution units within a Project. It provides the interface for task CRUD, status management, dependency mapping, and hierarchical re-organization via drag-and-drop.

## Core Entities & Data Models
* **Task:** The foundational work unit.
  * **Fields:** `Title`, `Description`, `Purpose`, `Actions`, `Additional Resources`, `Start Date`, `End Date`, `Notes`, `Assignee`, `Status`.
* **Subtask:** A child node of a Task.
* **Dependency:** A horizontal link between tasks dictating order of execution.
* **`task_type` discriminator (Wave 25 + PR 4):** a `text` column on `public.tasks` kept in lockstep with the row's depth in the `parent_task_id` tree. Possible values: `'project' | 'phase' | 'milestone' | 'task' | 'subtask'`; `derive_task_type(parent_task_id)` emits `subtask` for children of task-depth rows. Writers do not set the column manually — the `trg_set_task_type` BEFORE INSERT OR UPDATE OF `parent_task_id` trigger calls `public.derive_task_type(parent_task_id)` and assigns the result. Consumers can use the column to skip recursive tree walks ("all phases", "all milestones", "all leaves"). Migrations: `docs/db/migrations/2026_04_18_task_type_discriminator.sql`, `supabase/migrations/20260506003000_task_hierarchy_depth_guard.sql`.

## State Machines / Lifecycles
### Task Completion Lifecycle
Transitions strictly through: `To Do` -> `In Progress` -> `Complete` -> `Blocked` -> `N/A`.

### Auto-Completion Automation
* Toggling a parent to `Complete` forces a confirmation prompt if dependent sub-items exist. Confirmation cascades `Complete` status to all children.
* Any status toggle instantly recalculates parent Milestone/Project completion percentages.
* **Completion-flag invariant (Wave 23):** `is_complete === (status === 'completed')` is enforced *unconditionally* at the DB layer by the `sync_task_completion_flags` BEFORE INSERT/UPDATE trigger on `public.tasks` (migration: `docs/db/migrations/2026_04_17_sync_task_completion.sql`). The app-layer cascade/bubble-up logic in `planterClient.updateStatus` still owns multi-row orchestration — it now writes **only** `status` on every server payload and relies on the trigger to derive `is_complete`. Single-field raw SQL writes are reconciled (`UPDATE tasks SET status = 'completed'` flips `is_complete` to `true`, and vice versa). Dual-field writes are *also* reconciled — **`status` is the source of truth**, so `UPDATE tasks SET status = 'completed', is_complete = false` lands as `(status='completed', is_complete=true)`. There is no "both sides trusted" escape hatch; the invariant is the contract. Cross-ref: `docs/dev-notes.md` "Dual completion signals" (resolved Wave 23).

## Business Rules & Constraints
* **Max Subtask Depth:** Subtasks *cannot* have child tasks (Maximum depth = 1).
  * *Constraint:* `trg_enforce_task_hierarchy_depth` rejects inserts, updates, cycles, or reparenting operations that would exceed `project -> phase -> milestone -> task -> subtask`. If Task A has Subtask X, Task A cannot be dropped into Task B to become a subtask, preventing depth violations.
* **Drag-and-Drop Constraints (`useProjectDnd.ts` + `task-hierarchy.ts`):**
  * Items dropped adjacent to peers reorder the list index.
  * A childless Task dropped inside another Task becomes a Subtask.
  * Dragging a Task moves all of its nested Subtasks concurrently.
  * Invalid depth/cycle drops are rejected before mutation and surfaced as a recoverable localized toast; the DB trigger remains the trusted enforcement layer for direct API/RPC/database writes.
* **Kanban Board V2 (Wave 20):** Native column-to-column drag-and-drop is implemented in `src/features/tasks/components/board/` (`ProjectBoardView.tsx`, `BoardColumn.tsx`, `BoardTaskCard.tsx`). Drops between columns change task `status`; depth constraints and cycle detection still apply.
* **Dependencies:** Tasks mapped as dependencies cannot be closed out of sequence without throwing a warning.
* **Deletion Invariants:** Deleting an item triggers a warning and cascades a hard delete to all descendants.

## Recurrence (Wave 21)
A **template task** (`origin = 'template'`) may carry a recurrence rule under
`settings.recurrence`. When the rule fires, `supabase/functions/nightly-sync/`
deep-clones the template into the configured target project as an instance.

**Rule shape** (`src/shared/db/app.types.ts` → `RecurrenceRule`):
* `{ kind: 'weekly',  weekday: 0..6, targetProjectId }` — matches UTC weekday (0 = Sunday).
* `{ kind: 'monthly', dayOfMonth: 1..28, targetProjectId }` — capped at 28 to avoid Feb/leap edges.

**Evaluator:** `src/shared/lib/recurrence.ts` (frontend) and a byte-equivalent
mirror at `supabase/functions/_shared/recurrence.ts` (Deno). Keep the two
files in lock-step.

**Idempotency:** the spawned instance carries `settings.spawnedFromTemplate`
(template id) and `settings.spawnedOn` (UTC `YYYY-MM-DD`). The nightly-sync
recurrence pass short-circuits when a matching row already exists, so same-day
re-invocations are safe. **Note (Wave 22):** `Task.clone` in
`src/shared/api/planterClient.ts` now also stamps
`settings.spawnedFromTemplate` on every interactive clone, so the same key
powers both the recurrence idempotency check and the Master Library
de-duplication described in `library-templates.md`.

**UI:** `src/features/tasks/components/RecurrencePicker.tsx` renders inside
`TaskForm` only when `origin === 'template'`. The form emits flat
`recurrence_*` fields which `src/features/tasks/lib/recurrence-form.ts`
normalises into the nested JSONB shape before persisting.

## Coaching Tasks (Wave 22)

> **User-testing tranche note:** PR F makes coaching flag authoring
> template-only. Instance forms strip hidden `is_coaching_task` values before
> submit, and `pages/Project.tsx` only builds a settings patch for template
> origin, so project instances cannot mutate this flag through form paths.
> Existing instance badges/coach behavior remain read-only inherited behavior.

Any **instance task** (`origin = 'instance'`) may be tagged as a *coaching
task* via `settings.is_coaching_task: true`. The flag widens progress/status
access to users with the project `coach` role via an additive RLS UPDATE policy
plus a column-scope trigger (see `auth-rbac.md`).

**Flag shape** (`src/shared/db/app.types.ts` → `TaskSettings`):
* `is_coaching_task?: boolean` — absence / `false` both mean "not a coaching
  task"; only `=== true` activates the coach UPDATE policy.

**Authoring:** the "Coaching task" checkbox in
`src/features/tasks/components/TaskFormFields.tsx` is gated to
`origin === 'template'` and `membershipRole ∈ {owner, editor, admin}` (or app
admin). The prop flows `pages/Project.tsx` → `TaskDetailsPanel` → `TaskForm` →
`TaskFormFields`. Project instance forms do not render the toggle.

**Normalisation:** submit emits a flat `is_coaching_task` field only when the
template checkbox is registered. `src/features/tasks/lib/task-form-flags.ts`
strips coaching/strategy fields from instance form submissions, and
`buildTemplateFlagSettingsPatch()` returns `undefined` for instance origin even
if a crafted payload includes the flags. The lower-level helper pair in
`src/features/tasks/lib/coaching-form.ts` handles the merge into `settings`:
* `formDataToCoachingFlag(data)` → `true | false | null` (null = leave
  settings untouched — the UI gate hid the checkbox).
* `applyCoachingFlag(currentSettings, flag)` — preserves every other key,
  sets or deletes `is_coaching_task` per the flag.
* `extractCoachingFlag(task)` — canonical reader used by both `TaskForm`
  (seed `defaultValues`) and `TaskDetailsView` (badge).

**Surface:** `TaskDetailsView.tsx` renders a "Coaching" badge in the status
row when `extractCoachingFlag(task)` returns `true`.

**RLS:** `docs/db/migrations/2026_04_17_coaching_task_rls.sql` added the
`"Enable update for coaches on coaching tasks"` policy. PR 3 tightened that
policy with a matching `WITH CHECK` and added
`trg_enforce_coach_task_update_scope`: coaches may update only
status/completion progress on Coaching-labeled instance rows. Content,
settings, assignment, priority, hierarchy, origin/template metadata, and
delete paths remain denied below the UI. The owner/editor/admin UPDATE policy
is unchanged. Policy and trigger text are mirrored into `docs/db/schema.sql`
as the SSoT.

**Auto-assignment (Wave 23):**
`docs/db/migrations/2026_04_17_coaching_auto_assign.sql` adds a
`BEFORE INSERT OR UPDATE ON public.tasks` trigger (`trg_set_coaching_assignee`
→ `set_coaching_assignee()`). When a row carries
`settings.is_coaching_task = true` AND `assignee_id` is null, the trigger
resolves the project from `NEW.root_id`, walking `parent_task_id` first when a
new child row has not yet been root-stamped, then looks up coach membership for
that project. If *exactly one* coach is found, `NEW.assignee_id` is set to that
user. **Zero or multiple coaches → no-op**, leaving the field null so a human
can pick. **User intent wins:** the trigger never overwrites a non-null
`assignee_id` the caller supplied. The UI picks up the server-assigned coach via
the standard `useUpdateTask` / `useCreateTask` `onSettled` invalidation of
`['projectHierarchy', rootId]`.

**Backfill on membership change (Wave 24):**
`docs/db/migrations/2026_04_18_coaching_backfill_on_membership.sql` adds
a symmetric `AFTER INSERT OR UPDATE OR DELETE ON public.project_members`
trigger (`trg_backfill_coaching_assignees` → `backfill_coaching_assignees()`).
Wave 23's trigger fires only on task writes, so coaching tasks that were
created while the project had zero or multiple coaches retained
`assignee_id = NULL` forever. This wave closes that gap: when a
membership change causes the project to have **exactly one** coach, the
trigger runs `UPDATE public.tasks SET assignee_id = <sole coach>` over
every instance task on that project where `settings.is_coaching_task = true`
AND `assignee_id IS NULL`. **Never un-assigns:** transitioning from
1 → 0 coaches leaves existing assignments intact. **User intent still
wins:** the `assignee_id IS NULL` filter skips any task that already has
a caller-supplied assignee. Scoped via `root_id = <project_id>` so
unrelated projects are never touched.

## Strategy Templates (Wave 24)

> **User-testing tranche note:** PR F makes strategy flag authoring
> template-only. Instance forms strip hidden `is_strategy_template` values before
> submit, and `pages/Project.tsx` only builds a settings patch for template
> origin, so project instances cannot mutate this flag through form paths.
> Existing instance badges/follow-up behavior remain read-only inherited
> behavior.

Any **instance task** (`origin = 'instance'`) may be tagged as a *strategy
template* via `settings.is_strategy_template: true`. The flag is purely a
UX convention — no RLS carve-out, no additional DB triggers. It tells the
UI to surface Master Library follow-ups when the task is marked
`completed`, so planters can pull in a curated set of next-step tasks
right at the moment of completion.

**Flag shape** (`src/shared/db/app.types.ts` → `TaskSettings`):
* `is_strategy_template?: boolean` — absence / `false` both mean "not a
  strategy template"; only `=== true` activates the follow-up dialog.

**Authoring:** the "Strategy template" checkbox in
`src/features/tasks/components/TaskFormFields.tsx` sits next to the
"Coaching task" checkbox and shares the same template-only permission gate
(`origin === 'template'`, `membershipRole ∈ {owner, editor, admin}` or app
admin). The prop chain matches Coaching: `pages/Project.tsx` →
`TaskDetailsPanel` → `TaskForm` → `TaskFormFields`.

**Normalisation:** submit emits a flat `is_strategy_template` field only when
the template checkbox is registered. `task-form-flags.ts` strips
coaching/strategy fields from instance submissions and applies them only for
template-origin settings patches. The helper trio in
`src/features/tasks/lib/strategy-form.ts` mirrors `coaching-form.ts`:
* `formDataToStrategyTemplateFlag(data)` → `true | false | null` (null =
  leave settings untouched — the UI gate hid the checkbox).
* `applyStrategyTemplateFlag(currentSettings, flag)` — preserves every
  other settings key, sets or deletes `is_strategy_template` per the flag.
  Designed to chain after `applyCoachingFlag` in the merge sequence.
* `extractStrategyTemplateFlag(task)` — canonical reader used by both
  `TaskForm` (seed `defaultValues`) and `TaskDetailsView` (badge + dialog
  edge-trigger).

**Surface:** `TaskDetailsView` renders a "Strategy Template" emerald
badge next to the Coaching sky badge when the flag is true, and edge-
triggers `StrategyFollowUpDialog` exactly once per transition of
`status` into `'completed'` (via a `prevStatusRef` comparison in
`useEffect` so repeated re-renders with an already-completed row don't
reopen the dialog).

**Follow-up dialog**
(`src/features/tasks/components/StrategyFollowUpDialog.tsx`): wraps
`MasterLibrarySearch` in a Shadcn `Dialog`. Each pick calls
`planter.entities.Task.clone(templateId, parent_task_id, 'instance',
userId)` — the cloned task lands as a **sibling** of the completed
strategy task (same `parent_task_id`). Already-present templates are
hidden via the `excludeTemplateIds` prop (same dedupe convention as the
Wave 22 Master Library work). Dismissal is first-class; users may add
zero or many follow-ups.

**No DB migration.** The flag rides on existing `settings` JSONB; no new
RLS policy needed. Owners / editors already have UPDATE access on
instance tasks.

## Comments (Wave 26)

> **User-testing tranche note:** PR E removes comments from the project task
> detail UI as a UI-only change. `src/pages/Project.tsx` passes
> `showComments={false}` through `TaskDetailsPanel` to `TaskDetailsView`;
> `public.task_comments`, RLS policies, realtime hooks, activity-log triggers,
> and notification mention plumbing remain intact pending a separate
> data-retention decision.

Threaded task comments live in `public.task_comments`. Each row carries
`task_id` (the comment's target), `root_id` (auto-filled from the parent
task's root via `trg_task_comments_set_root_id`, mirrors the
`set_root_id_from_parent` pattern on `public.tasks`), and an optional
`parent_comment_id` self-FK for replies. The DB places **no depth cap** on
threading — the UI in `src/features/tasks/components/TaskComments/`
enforces a single-level visual nest with chain-lift for reply-to-reply.

**Soft-delete contract**: callers issue `UPDATE ... SET deleted_at = now(),
body = ''` (clearing the body to scrub the cached query payload).
`useTaskComments` filters `deleted_at IS NULL` by default. Hard `DELETE` is
reserved for admin/cleanup paths.

**RLS** (migration `docs/db/migrations/2026_04_18_task_comments.sql`):
* SELECT — any project member via `is_active_member(root_id, auth.uid())`.
* INSERT — any project member; `author_id` pinned to `auth.uid()` via
  `WITH CHECK`.
* UPDATE — author of the comment, undeleted only. Immutable fields:
  `task_id`, `root_id`, `parent_comment_id`, `author_id`.
* DELETE — author, project owner (`check_project_ownership_by_role`), or
  admin.

**Realtime** — table is in the `supabase_realtime` publication; the
per-task channel in `src/features/tasks/hooks/useTaskCommentsRealtime.ts`
invalidates `['taskComments', taskId]` on any payload.

**Phase Lead (Wave 29):** `settings.phase_lead_user_ids: string[]` on phase/milestone rows is consumed by the additive RLS UPDATE policy `"Enable update for phase leads"` and the `user_is_phase_lead` recursive ancestor-walk (starts at the parent; the row itself is never matched). See `auth-rbac.md` for the policy text and `src/features/projects/lib/phase-lead.ts` for the form helpers.

## Integration Points
* **Date Engine:** Dragging tasks triggers date inheritance logic (`dateInheritance.ts`) to adjust bounds automatically.
* **Task/reporting surfaces:** Feeds raw status counts to task views, project
  progress, reports, and admin analytics.
* **Nightly CRON:** Owns the recurrence-clone pass (see `supabase/functions/nightly-sync/README.md`).

## Known Gaps / Technical Debt
* None currently identified.
