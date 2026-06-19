# Date Engine — Bottom-Up Envelope Roll-Up (spec)

Status: **DRAFT / spec-first (no code yet)** — 2026-06-19
Supersedes the live top-down sequential waterfall. Replaces the model in
`date-engine.md` (which describes an envelope but is otherwise stale).

## The decision
Switch the date engine from a **top-down sequential waterfall** (siblings laid
back-to-back in `position` order, parent = sum of children) to a **bottom-up
envelope roll-up**:

- A **task** has a **start** and a **duration**; `due = start + duration`.
- A task's start/duration is **independent of its siblings** — tasks can run in
  parallel and **overlap**, so several tasks may be due the same day.
- A **container** (milestone → phase → project root) **rolls up** from its
  children: `start = MIN(children.start)`, `due = MAX(children.due)`.
- Editing or drag-dropping a task **propagates upward** (re-rolls the milestone,
  then phase, then root). Nothing propagates sideways or downward.

`position` becomes **ordering only** — it no longer affects dates. This is the
core of the breakthrough: milestones are **not** sequential.

## Why the current engine fights this
Live `recompute_subtree_waterfall(task, start)` chains children:
`each child.start := previous child.due`. That makes two siblings sharing a day
**structurally impossible** and derives the milestone as a *sum*, not an
envelope. We drop this.

## What's already in the DB (reusable)
- `calc_task_date_rollup()` — SECURITY DEFINER trigger fn that does exactly the
  envelope: sets a parent's `start = MIN(child start)`, `due = MAX(child due)`,
  recursing upward (guarded at `pg_trigger_depth() > 4`). **Currently detached.**
  → Re-attach as the AFTER trigger.
- `trg_waterfall_recompute` + `recompute_project_dates_waterfall` +
  `recompute_subtree_waterfall` — the sequential engine. → **Drop.**
- `enforce_task_date_envelope` (BEFORE) — already neutered; leave or drop.

## The data-model gap — DECISION NEEDED
A non-sequential task needs **two** numbers: **when** it starts and **how long**
it lasts. The table has only **one** (`days_from_start`, integer) plus
`start_date`/`due_date`.

- **Instances** are fine with the existing columns: `start_date` is the absolute
  "when", and we can treat `days_from_start` as the duration → `due = start_date
  + days_from_start`.
- **Templates** carry **NULL** dates, so they have no absolute "when". To stay
  cloneable into a dated schedule they need a **relative offset AND a duration** —
  two numbers — but only `days_from_start` exists.

**Recommended:** add a **`duration`** integer column (days).
- `days_from_start` = **offset** from the project start (relative "when").
- `duration` = **length** (the "how long").
- Leaf: `start_date = project_start + days_from_start`; `due_date = start_date + duration`.
- Container: MIN start / MAX due envelope.
- The app already references `task.duration` (TaskItem badge, `bump_template_version`),
  so this column is half-anticipated.
- NOTE: this means the **"Duration (working days)" field we just shipped is bound
  to the wrong column** (`days_from_start` = offset). It should bind to the new
  `duration`; `days_from_start` becomes a separate "start offset" field.

**Alternative (no new column):** treat `days_from_start` as duration and require
**every** task (templates included) to carry an explicit relative start — not
expressible without a second field, so this only works if templates also stop
being relative. Not recommended.

This is de-risked by the planned data wipe + re-migration ("the next Zap"):
existing `days_from_start` values don't need semantic-preserving backfill.

## Open decisions
1. **Add `duration` column?** (recommended yes — see above).
2. **Business days vs calendar days** for `due = start + duration`. The app has a
   US-federal business calendar (`shared/lib/date-engine`); the dead waterfall
   used plain calendar-day add. Planters likely think in calendar weeks. Pick one
   and apply consistently in the trigger.
3. **Leaf start authority on instances:** is `start_date` user-authoritative
   (drag/drop sets it directly) or always re-derived from `project_start +
   days_from_start`? (Affects whether drag/drop writes `start_date` or the offset.)

## Implementation outline (post-decisions)
DB (one migration, applied via `supabase db push`):
1. (if approved) `ALTER TABLE tasks ADD COLUMN duration integer NOT NULL DEFAULT 0`.
2. BEFORE INSERT/UPDATE trigger on leaves: `due_date := start_date + duration`
   (calendar or business days per decision #2); no-op when `start_date` is NULL
   (templates stay date-NULL).
3. Drop `trg_waterfall_recompute`; re-attach `calc_task_date_rollup` as
   AFTER INSERT/UPDATE OF (start_date, due_date, duration, parent_task_id) OR DELETE.
4. Keep the `app.in_*_recompute` re-entrancy guard pattern to avoid trigger storms.

App:
5. `constructUpdatePayload` / `calculateScheduleFromOffset` / `constructCreatePayload`
   — stop writing `start==due` and stop the offset-as-position math; write
   `start` + `duration`, let the trigger roll up. Drop the min/max
   `updateParentDates` call in `useUpdateTask.onSettled` (now DB-side).
6. `TaskFormFields` — split the single field into **Start offset** (days_from_start)
   and **Duration** (duration); keep duration template/admin-gated (just shipped).
7. `clone_project_template` — set leaf `start_date = project_start +
   days_from_start`, `duration` carried from template; let rollup fill containers.
8. App types (`app.types.ts`) + Gantt drag handlers write the new fields.

Docs/tests:
9. Rewrite `date-engine.md` to this model; add tests: overlap (two same-day dues),
   roll-up on edit, roll-up on drag/drop reparent, template clone, NULL-date template.
