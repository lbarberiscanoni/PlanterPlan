-- Remove the inert phase-locking write-path machinery (Step 3 / sub-step 2).
--
-- Evidence (live prod, 2026-06-12): 0 / 4843 tasks have prerequisite_phase_id set,
-- and 0 / 4843 tasks are is_locked, across all 89 projects + every template. Both
-- AFTER-UPDATE triggers below fire on every task status change and update ZERO
-- rows: the "lock" half of the feature was never built (only unlock logic exists),
-- so nothing is ever locked, so the unlock paths match nothing.
--
--   * trigger_phase_unlock -> check_phase_unlock(): on each is_complete update,
--     walks Task->Milestone->Phase and scans the phase for incomplete tasks, then
--     unlocks phases where prerequisite_phase_id = <phase>. prerequisite_phase_id
--     is NULL everywhere, so the UPDATE matches nothing. No OLD/NEW edge guard, so
--     it re-runs the tree-walk on every idempotent completion write.
--   * trg_unlock_next_phase -> handle_phase_completion(): on status -> 'completed',
--     unlocks the next sibling by position. is_locked is false everywhere, so the
--     unlock is a no-op.
--
-- Dropping both removes per-write tree-walking overhead with zero behavioral change
-- (proven: it changes no rows today).
--
-- KEPT ON PURPOSE: tasks.is_locked and tasks.prerequisite_phase_id columns. The UI
-- still reads task.is_locked to render locked-state affordances (TaskItem.tsx,
-- PhaseCard.tsx, MilestoneSection.tsx). The columns are harmless inert state (all
-- default). Removing them + the UI that renders them is a separate product decision
-- to kill a built-but-dormant feature, not a write-path cleanup, and is NOT done here.

DROP TRIGGER IF EXISTS trigger_phase_unlock ON public.tasks;
DROP TRIGGER IF EXISTS trg_unlock_next_phase ON public.tasks;

DROP FUNCTION IF EXISTS public.check_phase_unlock();
DROP FUNCTION IF EXISTS public.handle_phase_completion();
