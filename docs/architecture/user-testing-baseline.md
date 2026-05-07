# User-Testing Baseline

This document records the user-testing gap-closure baseline for the release
hardening series that follows the first user-testing PR tranche. It is a
planning and release-control source of truth: it separates verified current
`main` behavior from remaining implementation work.

## Source Status

Verified primary-source facts from the 2026-05-05 planning pass:

* The public Notion root page and public subpages `archive`, `Spec md`, and
  `temp` were accessible. Relevant linked Notion task pages for due-date
  engine, dashboard, project creation from template, template-note copying,
  and item details were also inspected.
* Direct Notion database row querying was not available, so row-level evidence
  came from Notion search and direct page fetches.
* Notion-backed requirements found in that pass: project creation from
  template is in progress or buggy, template notes must not copy into project
  items, date-engine work is in progress, and item detail behavior differs
  between projects and templates.
* Notion did not directly state "kill dashboard" or "remove comments from the
  project task view"; those are accepted prompt directives for this tranche.
  The accepted scope for comments is project-context task detail: the database,
  RLS, realtime, notifications, and non-project task-comments surface stay
  intact until a separate product decision says otherwise.

Repo baseline on `main` at `fc4c39d`:

* `/dashboard` redirects to `/tasks`; the dashboard page and pipeline board are
  absent from the route tree. Global creation entry points live in the shell via
  `CreationActionHost`, the project sidebar, and the mobile FAB.
* Project lifecycle display derives from task state. The old drag/drop manual
  project-state pipeline is gone; archive remains an explicit visibility-only
  root-status action.
* Project-context task detail passes `showComments={false}` and therefore hides
  `TaskComments`. Non-project callers may still opt in to comments.
* Template behavior flags (`is_coaching_task`, `is_strategy_template`) are
  editable only from template forms. Instance submit paths strip hidden flag
  mutations before building settings patches.
* `initialize_default_project` is characterized by pgTAP baseline tests:
  blank project creation creates owner membership, six phases, and the current
  scaffold shape.
* `clone_project_template` is characterized by pgTAP tests, including
  instance clone note isolation and approved settings preservation from PR G.
* The app and edge date-engine layers have a custom `BusinessCalendar` seam, and
  direct `date-fns` imports are constrained to `src/shared/lib/date-engine/*`.
  Date-kind scheduling and urgency now use `us-federal-observed` business days;
  explicit calendar-day paths remain available for compatibility.
* GitHub triage on 2026-05-05 closed stale blockers: Dependabot PR #202
  included React 19 upgrades against the pinned React 18.3.1 baseline, draft PR
  #198 conflicted with current `main`, and issue #130's direct-`date-fns`
  affected-file list was stale after the boundary test landed.

## Accepted Target Directives

These directives guide the ordered PR series. If a future Notion source or
owner decision conflicts, prefer a smaller reversible PR plus characterization
coverage before changing behavior.

* Remove the project dashboard as a product surface. Move project/template
  creation entry points first, then remove `/dashboard` and its pipeline board.
* Project lifecycle should be derived from task state. Manual project state
  changes through drag/drop pipeline controls must be removed after a derived
  read-only replacement exists.
* Remove comments from the project task detail UI first. Keep
  `task_comments`, RLS, realtime, and notification plumbing intact unless a
  later explicit data-retention decision says otherwise.
* Coaching task and strategy-template flags must be editable only on template
  rows. Project instances may retain inherited read-only badges/behavior, but
  instance create/update paths must not mutate those flags.
* Template-to-project creation/import must be characterized and fixed so
  hierarchy, ordering, settings, clone metadata, and displayed project state
  are consistent.
* Template notes must not copy into project items.
* Date-engine work must start with characterization and an ADR. The selected
  direction is to keep `date-fns` constrained to the app date-engine layer and
  add a custom business-calendar abstraction with mirrored edge-function
  utilities before changing behavior.
* Alpha date-kind scheduling uses a custom `us-federal-observed` business
  calendar after the inert app/edge calendar implementations and parity tests.
  `calendar-day` remains the compatibility behavior for explicit calendar-day
  paths.

## Current Implementation Gaps

| Area | Current implementation | Target gap | Planned PR |
| --- | --- | --- | --- |
| Dashboard | PR D redirects `/dashboard` to `/tasks`, removed the dashboard page and pipeline board, and keeps creation on `/tasks?action=...`. PR R2 removes the stale dashboard feature slice, shell naming, and creation-copy namespace. | Product dashboard surface is no longer a user-facing route; the only remaining `/dashboard` behavior is bookmark-compatible redirect. | Done PR D/R2 |
| Project state | PR D removed generic project lifecycle status mutation from user surfaces; archive remains a visibility-only root-status flag. | Lifecycle badges/selectors derive from child task state; archive remains visibility-only unless product revises it. | Done PR D |
| Comments | PR E passes `showComments={false}` from the project route, hiding `TaskComments` only in project-context task detail. | Backend comments, RLS, realtime, and notification plumbing stay intact. | Done PR E |
| Coaching flag | PR F exposes `settings.is_coaching_task` editing only on template forms and strips instance form payloads. | Instances preserve inherited behavior read-only. | Done PR F |
| Strategy flag | PR F exposes `settings.is_strategy_template` editing only on template forms and strips instance form payloads. | Instances preserve inherited behavior read-only. | Done PR F |
| Template clone | PR G clears template notes when cloning/importing into project instances and preserves only approved inherited metadata (`project_kind`, coaching, and strategy flags). | Instance clones receive blank notes while preserving approved metadata. | Done PR G |
| Date engine | PR H documents the selected business-calendar direction and characterizes app/edge UTC parity plus the `date-fns` boundary. PR I1 adds app/edge business-calendar interfaces with current calendar-day behavior. PR I2 routes active app schedule offsets, project shifts, display urgency, ICS `DTEND`, and nightly-sync due-soon cutoffs through the seam without changing behavior. PR R4 adds `weekday` and `us-federal-observed` app/edge calendars. PR R5 switches date-kind scheduling and urgency to `us-federal-observed` while keeping explicit calendar-day compatibility. | Regional/organization-specific holiday configuration is not implemented. | Done PR H/I1/I2/R4/R5 |

## Remaining PR Sequence

The first tranche (PR A through PR H/I1/I2) is already represented on `main`.
The active sequence is now:

| PR | Scope | Merge dependency |
| --- | --- | --- |
| Gate 0 | Triage stale GitHub PRs/issues and record current release state. | Done 2026-05-05 |
| PR R1 | Refresh this baseline and the date-engine ADR with verified source status, comments scope, and calendar defaults. | Gate 0 |
| PR R2 | Remove dashboard residue without changing the `/dashboard -> /tasks` redirect or derived-state behavior. | PR R1 |
| PR R3 | Add release smoke coverage for blank project creation and official-template project creation, including no-note-copy UI verification. | PR R2 |
| PR R4 | Add inert `weekday` and `us-federal-observed` app/edge business calendars plus parity tests. | PR R3 |
| PR R5 | Switch date-kind scheduling paths to `us-federal-observed`; keep checkpoint exclusions and calendar-day compatibility where explicitly required. | PR R4 |
| PR R6 | Run and repair the release validation suite, fixing only failures introduced by R1-R5. | PR R5 |

## Release Rules

Every PR in this tranche must:

* branch from current `main`;
* change one behavior slice only;
* add characterization before high-risk refactors;
* update docs and tests in the same PR as behavior changes;
* run the narrowest useful validation first, then broader validation;
* follow the 5-minute / 10-minute PR comment and CI loop before merge.

One branch and one PR must be active at a time. Do not start the next PR until
the prior PR is merged after the 5-minute / 10-minute comment and CI loop.
