# docs/architecture/date-engine.md

## Domain Overview
The Date Engine is an autonomous logic layer that calculates task urgency based on specific time horizons, dynamically adjusts cascading dates, and restricts temporal boundaries based on Project settings and item inheritance.

## Core Entities & Data Models
* **Date Status:** Computed state indicating urgency (Not Yet Due, Current, Due Soon, Overdue).
* **Time Horizons:** Configured globally per project (e.g., `Due soon = 2 days`).
* **Payload Helpers:** Utilities that construct valid date ranges based on parent/child limits.

## State Machines / Lifecycles
### Urgency Status Lifecycle
Calculated dynamically based on system time vs. Task End Dates:
1. **Not Yet Due:** Current date is prior to the active horizon.
2. **Current:** Task is within the active window.
3. **Due Soon:** Task End Date falls within the project's configured `Due soon time horizon`.
4. **Overdue:** Current date has passed the End Date, and the task is not marked complete (`status !== 'completed'`). *Wave 23 note:* `is_complete` and `status === 'completed'` are kept in lockstep by the `sync_task_completion_flags` DB trigger (see `tasks-subtasks.md`), so either field can be used safely — `status` is the canonical check.

## Business Rules & Constraints
* **Cascading Logic:** Phase and Milestone start/due dates are dynamically calculated from the earliest start and furthest due dates of their direct child tasks.
* **Global Date Shifts:** Editing the Project-level start date shifts incomplete nested Phases, Milestones, Tasks, and Subtasks through `dateProjectBusinessCalendar` to preserve relative spacing. Completed rows keep their historical dates.
* **Parent Date Envelopes (PR 5):** `trg_enforce_task_date_envelope` rejects direct DB/API writes that invert a task date range, move a dated child outside a dated parent, reparent a dated row into an incompatible parent envelope, or shrink a parent around existing child dates. The Gantt drag-shift UI mirrors this rule; manual edit surfaces rely on the trusted DB/API error and recover without persisting invalid dates.
* **Dependency Auto-Adjustment:** Dependency relationship UI is display/link management only today; no trusted dependency-date auto-adjustment or completion-warning enforcement exists in the current implementation.
* **Template Exclusion:** The Date Engine is entirely disabled for Library Templates. Template tasks use `duration` and `days from start until due`.
* **Checkpoint projects (Wave 29):** `recalculateProjectDates` and `deriveUrgencyForProject` short-circuit when the project root carries `settings.project_kind === 'checkpoint'`; nightly-sync skips urgency transitions for those roots; due dates render as informational only. `isCheckpointProject` is lock-step with `supabase/functions/_shared/date.ts`.
* **Wave 31:** display-time date formatting uses `formatDateLocalized` from `src/shared/i18n/formatters.ts` (Intl `DateTimeFormat` / `RelativeTimeFormat` with per-locale caches). Internal math stays UTC-anchored ISO strings here in `date-engine/index.ts` — `compareDateAsc`, `isBeforeDate`, `formatDisplayDate`, cascade/rollup calculations, etc. Don't conflate the two: calling `formatDateLocalized` in a comparator silently breaks sort stability across locales; calling `formatDisplayDate` in JSX silently renders the wrong language.
* **Business-calendar seam (PR I1/I2/R4/R5):** `src/shared/lib/date-engine/business-calendar.ts` and `supabase/functions/_shared/business-calendar.ts` expose app/edge `BusinessCalendar` interfaces. `defaultBusinessCalendar` remains `calendar-day` for compatibility wrappers whose callers mean literal calendar-day math. `dateProjectBusinessCalendar` is `us-federal-observed`; date-kind schedule offsets, global project shifts, app urgency, task-filter urgency, and nightly-sync due-soon cutoffs use it. ICS all-day `DTEND` remains an explicit `calendar-day` path because RFC 5545 `DTEND` is exclusive calendar rendering, not project scheduling.

## Integration Points
* **Tasks & Subtasks:** The drag-and-drop system relies heavily on the Date Engine to recalculate bounds when items are moved.
* **Task surfaces and reports:** Feeds due-soon and overdue display state to
  task lists, project views, Gantt, reports, and admin analytics.
* **Nightly CRON (Wave 20):** `supabase/functions/nightly-sync/` owns the *write* path for urgency-status transitions (`not_started` → `in_progress` → `due_soon` → `overdue`) using per-project `settings.due_soon_threshold`. Due-soon threshold dates route through `supabase/functions/nightly-sync/urgency.ts` and the edge `dateProjectBusinessCalendar` while preserving the original UTC time-of-day. The app-layer Date Engine computes urgency for display (`deriveUrgency`) but no longer writes status to the DB itself. See `supabase/functions/nightly-sync/README.md`.
* **Gantt drag-shift (Wave 28 + PR 5):** `src/features/gantt/hooks/useGanttDragShift.ts` validates bounds via `isBeforeDate`/`compareDateAsc`, then routes through `useUpdateTask`. The same parent-envelope invariant is enforced again by `trg_enforce_task_date_envelope`; cascade-up logic in `updateParentDates` remains the app-side cache reconciliation path.
* **Decision record (PR H/I1/I2/R4/R5):** `docs/architecture/date-engine-business-calendar-adr.md` records the accepted direction: keep `date-fns` inside the app date-engine layer, add a custom business-calendar seam, and use the custom `us-federal-observed` calendar for date-kind scheduling/urgency.

## Known Gaps / Technical Debt
* Date-kind scheduling now skips weekends and nationwide US federal observed
  holidays, but the calendar is not yet configurable by region or organization.
* **User-testing tranche direction (PR H, PR I+):** PR H added the decision
  record and characterization tests. PR I1 added the app/edge business-calendar
  seam with no runtime behavior change. PR I2 routed active app/edge scheduling
  callers through that seam while keeping calendar-day behavior. PR R4 added
  weekday/holiday calendars. PR R5 switched date-kind scheduling and urgency to
  `us-federal-observed` while preserving UTC/date-only semantics,
  checkpoint-project exclusions, template exclusions, task hierarchy rollups,
  and `nightly-sync` / edge utility parity.
