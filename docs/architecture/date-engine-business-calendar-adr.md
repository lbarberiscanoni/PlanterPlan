# Date Engine Business Calendar ADR

## Status
Accepted for the user-testing tranche. PR H recorded the decision and
characterization net. PR I1 added the app/edge business-calendar interfaces
with calendar-day behavior. PR I2 routed active scheduling and urgency callers
through the seam without changing behavior. The 2026-05-05 release-hardening
plan keeps this custom-engine direction and selects `us-federal-observed` as
the Alpha calendar for date-kind scheduling. PR R4 added `weekday` and
`us-federal-observed` implementations plus app/edge parity tests. PR R5
switched date-kind scheduling and urgency callers to
`dateProjectBusinessCalendar = us-federal-observed` while keeping
`calendar-day` as the compatibility default.

## Context
PlanterPlan currently centralizes app date math in `src/shared/lib/date-engine`.
That layer uses `date-fns` wrappers plus custom UTC/date-only helpers. Supabase
Edge functions cannot import the app tree, so `supabase/functions/_shared/date.ts`
mirrors the small set of edge-safe date helpers used by `nightly-sync`,
supervisor reports, and ICS feeds.

Before PR R5, runtime behavior was calendar-day based and did not skip weekends
or regional holidays. Current date-kind scheduling skips weekends and nationwide
US federal observed holidays; regional/organization-specific holiday
configuration is not implemented. Checkpoint projects suppress date shifting and
urgency, while template forms keep relative `days_from_start` / duration
authoring instead of instance schedule writes.

## Decision
Keep the existing `date-fns` dependency constrained to
`src/shared/lib/date-engine`, introduce a custom `BusinessCalendar`
abstraction, and route runtime scheduling callers through it without changing
behavior. Mirror the abstraction needed by Supabase Edge utilities before any
weekend or holiday rule changes.

The first implementation slices preserve the current calendar-day behavior.
The next slices add two non-default calendars behind the seam:

* `weekday`: skips Saturday and Sunday only.
* `us-federal-observed`: skips Saturday and Sunday plus observed US federal
  holidays.

After those calendars are tested in both the app and Edge mirrors, date-kind
project scheduling switches to `us-federal-observed`. Checkpoint projects
continue to suppress schedule shifting and urgency. `calendar-day` remains as a
compatibility calendar for explicitly calendar-day paths and tests.

## PR I1 Implementation
PR I1 adds:

* `src/shared/lib/date-engine/business-calendar.ts`, exported through the app
  date-engine package path for direct imports;
* `supabase/functions/_shared/business-calendar.ts`, the Deno edge mirror;
* app, edge, and parity tests proving the `calendar-day` implementation keeps
  Friday + 1 business day as Saturday and treats weekends as business days.

PR I1 does not route scheduling, urgency, nightly-sync, recurrence, or ICS
logic through the new seam. PR I2 owns that no-behavior-change migration.

## PR I2 Implementation
PR I2 routes current runtime callers through the app/edge seams:

* `calculateScheduleFromOffset`, `recalculateProjectDates`, and `deriveUrgency`
  use `defaultBusinessCalendar` while normalizing date-only inputs to explicit
  UTC date-only values where hierarchy scheduling depends on `YYYY-MM-DD`
  semantics;
* `supabase/functions/ics-feed/ics.ts` advances all-day `DTEND` through the
  edge business-calendar seam;
* `supabase/functions/nightly-sync/urgency.ts` computes due-soon cutoffs
  through the edge business-calendar seam while preserving the current UTC
  time-of-day threshold behavior;
* characterization tests keep weekend-inclusive calendar-day behavior locked.

PR I2 intentionally does not change recurrence evaluation or clone scheduling.
Those paths already operate on UTC `YYYY-MM-DD` stamps and remain covered by
the parity requirements below.

## Rationale
This is the safest path for PlanterPlan because current behavior depends on:

* UTC/date-only persistence and display-independent math;
* project hierarchy rollups and bulk shift rules;
* checkpoint project exclusions;
* template exclusions from instance date writes;
* nightly-sync parity for urgency and recurrence clone scheduling;
* future holiday support that must work in both the browser app and Deno Edge.

A thin app/edge business-calendar interface gives tests a stable seam without
moving to local-time package semantics or broadening the dependency surface.
PR I must explicitly audit date-only string parsing in the current `date-fns`
wrappers before routing business-calendar behavior through them, because local
timezone parsing can differ from the Edge helpers' explicit `Date.UTC`
constructors.

## Rejected Alternatives
* **Add a business-day package now:** rejected because holiday calendars, Deno
  parity, and UTC/date-only behavior would still need custom code.
* **Replace the engine with a package-first implementation:** rejected because
  it creates high regression risk across hierarchy shifts, checkpoint projects,
  and template exclusions before the characterization net is complete.
* **Leave the engine as-is:** rejected because it leaves no explicit seam for
  weekend/holiday rules or edge parity tests.

## Parity Requirements For PR I+
* App and edge helpers must agree on `YYYY-MM-DD`, UTC month keys, UTC-midnight
  truncation, and checkpoint project detection.
* `nightly-sync` overdue/due-soon transitions must preserve checkpoint
  exclusions and current threshold semantics until a product-approved behavior
  change lands.
* Recurrence clones must continue stamping UTC `YYYY-MM-DD` values and must not
  copy recurrence rules into instances.
* Template create/update payloads must continue to avoid instance schedule
  writes; project instances must keep derived dates.
* Any weekend/holiday configuration must be testable without relying on local
  timezone or runtime locale.

## PR H Characterization
PR H adds tests that lock:

* no direct `date-fns` imports outside `src/shared/lib/date-engine`;
* app/edge parity for UTC date helpers and checkpoint detection;
* current calendar-day arithmetic, including weekend-inclusive day addition;
* existing template exclusion and checkpoint carve-out coverage.

## PR I1 Characterization
PR I1 adds tests that lock:

* the app and edge default business calendar to the `calendar-day`
  implementation;
* weekend-inclusive "business day" behavior;
* app/edge parity for `addBusinessDays`, `diffInBusinessDays`, and
  `isBusinessDay` on valid date-only inputs.

## PR I2 Characterization
PR I2 adds tests that lock:

* schedule offsets and project date shifts routed through the seam still count
  weekends as calendar days;
* date-only business-calendar arithmetic remains UTC-stable across DST
  boundaries;
* full ISO root dates normalize through UTC date-only scheduling;
* ICS all-day `DTEND` stays one calendar day after `due_date`;
* nightly-sync due-soon thresholds preserve UTC time-of-day while routing the
  date portion through the edge business-calendar seam.

## PR R4 Implementation
PR R4 adds non-default app and Edge calendars without changing runtime callers:

* `weekday`: skips Saturday and Sunday.
* `us-federal-observed`: skips Saturday and Sunday plus nationwide US federal
  observed holidays. This includes fixed-date observed rules, MLK Day,
  Washington's Birthday, Memorial Day, Juneteenth from 2021 onward,
  Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, and
  Christmas. It does not include DC-specific Inauguration Day.

PR R4 tests positive, negative, and zero offsets; weekend boundaries; year
boundaries; and observed holidays that land on weekends. App and Edge tests keep
the implementations aligned while `defaultBusinessCalendar` remains
`calendar-day`.

## PR R4/R5 Requirements
PR R4 added `weekday` and `us-federal-observed` without changing runtime
defaults. App and Edge implementations agree for date-only inputs, negative
offsets, zero offsets, weekend boundaries, year boundaries, and observed-holiday
cases where the legal holiday falls on a weekend.

PR R5 may change behavior only after PR R4 lands. It must switch date-kind
scheduling and urgency callers to the `us-federal-observed` calendar while
preserving checkpoint exclusions, UTC date-only persistence, recurrence clone
stamps, and template-form relative date authoring.

## PR R5 Implementation
PR R5 adds `dateProjectBusinessCalendar` in both app and Edge mirrors, pointing
to `us-federal-observed`, while leaving `defaultBusinessCalendar` on
`calendar-day`.

Runtime changes:

* `calculateScheduleFromOffset` uses `dateProjectBusinessCalendar`, so template
  `days_from_start` offsets on instances skip weekends and observed US federal
  holidays.
* `recalculateProjectDates` calculates project-start diffs and cascaded task
  shifts in date-project business days; checkpoint roots still return no batch
  shifts.
* `deriveUrgency`, `deriveUrgencyForProject`, task filters, and
  `nightly-sync` due-soon cutoffs count `settings.due_soon_threshold` in
  date-project business days.
* `supabase/functions/ics-feed/ics.ts` explicitly uses
  `calendarDayBusinessCalendar` for all-day `DTEND`, because that field is an
  exclusive calendar rendering boundary rather than project scheduling.

PR R5 tests cover app/edge calendar selection, weekend and observed-holiday
offsets, project shifts, urgency thresholds, task-filter checkpoint suppression,
nightly-sync due-soon parity, and the unchanged ICS `DTEND` calendar-day
compatibility path.
