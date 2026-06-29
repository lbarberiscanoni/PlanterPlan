# PlanterPlan — E2E Flow Catalog

This is the source-of-truth list of end-to-end UX flows. It serves **two** consumers:

1. **The static Playwright suite** (`/e2e`) — deterministic regression tests. The `@smoke`
   and `@regression` sets below map 1:1 to spec files.
2. **The exploratory agent** — a periodic, non-deterministic pass that *looks for* new
   problems (the "be Tim" pass). Its mission list is the **Exploration goals** section.

> See `CLAUDE.md → Testing & Regression Policy` for the rules. Status tags:
> `READY` exists & testable · `READY*` exists but was unchecked on the old acceptance list ·
> `PARTIAL` data layer exists, UI wiring unverified · `BLOCKED` not built · `STALE` spec drifted from code.

---

## Environment

- Tests hit a **deployed URL** (`E2E_BASE_URL`) — local can't reach remote Supabase, no Docker.
- Seeded accounts (`E2E_PASSWORD`): `E2E_ADMIN_EMAIL` (global admin), `E2E_PLANTER_EMAIL`
  (per-project Planter), `E2E_TEAM_EMAIL` (per-project Team).
- **No separate test DB.** Tests stamp created data with `[e2e-<runId>]` and tear it down by
  tag + creator in `globalTeardown` (service-role, guarded). A nightly reaper sweeps stragglers.

---

## `@smoke` — runs per-PR (core loop; must stay fast + stable)

| ID | Flow | Role | Assertion |
|----|------|------|-----------|
| SMK-01 | Login | each | creds → `/dashboard`; admin nav present only for admin |
| SMK-02 | Template → clone → project | planter | subtree cloned, dates shifted, planter is a member |
| SMK-03 | Date cascade | planter | edit project **start** → descendants shift by delta; **due is read-only** |
| SMK-04 | `/tasks` grouping | planter | milestone-grouped default; **no giant "No Milestone"/"Other" bucket**; project labels present |
| SMK-05 | Completion + N/A | planter | mark complete (reversible); N/A excluded from completion denominator |
| SMK-06 | Delete is admin-only | all 3 | admin can delete a task; planter + team cannot |

## `@regression` — runs nightly / pre-release (each guards a specific fix)

Every row below is a scar from a real fix. The spec comment links the commit/stakeholder item.

| ID | Guards (commit) | Assertion | Feature tag |
|----|-----------------|-----------|-------------|
| REG-01 | `5cd73d6c` #1/#3 | project-create picker shows **only** `task_type='project'` roots; add-task picker shows only task/phase items | `@templates` |
| REG-02 | `08ec148b` #2 | add-phase picker search finds a phase that exists **only nested** inside a template | `@library` |
| REG-03 | `5cd73d6c` #5 | library-item **edit** form has purpose/actions/notes/duration and they **round-trip persist** (add/edit parity) | `@library` |
| REG-04 | `5cd73d6c` #7-clone | attach catalog resource → clone template → cloned task **keeps resource_id + name** | `@resources` |
| REG-05 | `242b62ad` #7 | planter submits resource → hidden from catalog → admin "Pending (N)" queue → approve → appears; non-admin **cannot** approve | `@resources` |
| REG-06 | `08ec148b` #4b | admin **can** delete a nested milestone inside a template; cascade removes descendants | `@library` |
| REG-07 | `68d2b569` | task delete blocked for planter+team, allowed for admin | `@tasks` |
| REG-08 | `e6a4a05f` | edit project start → every descendant shifts by delta; due field disabled | `@dates` |
| REG-09 | `75d746ec` / `ef3d928b` | `/tasks` grouped view has no catch-all bucket; every leaf rolls to milestone/phase | `@tasks` |

### Invariant tests (catch a *class* of bug, not one)

These are higher-leverage — they'd have caught Tim's "start date doesn't save" bug without anyone
knowing about it specifically.

| ID | Invariant | Feature tag |
|----|-----------|-------------|
| INV-01 | **Every editable field round-trips:** edit → reload → value persisted (run across task + project + library forms) | `@regression` |
| INV-02 | **No orphan grouping:** no `/tasks` group contains a number of items implausibly larger than its siblings (catch-all detector) | `@tasks` |

---

## Full flow catalog (beyond smoke/regression)

Grouped as on the acceptance checklist. `BLOCKED`/`PARTIAL` items are not yet specced — they're
candidates for the exploration agent and future regression tests.

- **Admin/Templates** — add custom/master node `READY`, delete node `READY`, publish/unpublish `READY`,
  add-to-master-library `READY`, master-library search `READY`.
- **Admin/General** — manage resource library `READY*`, analytics dashboard `READY*`, user management `READY*`,
  project management `READY*`, non-admin redirect `READY`, license mgmt `BLOCKED`, discount codes `BLOCKED`,
  new-project email `BLOCKED`.
- **Reports** — by-month `READY`, progress chart `READY`, due/overdue/complete counts `READY`,
  milestone/phase progress `READY`, downloadable `READY`, automated email `BLOCKED`.
- **Dashboard** — relevant tasks `READY`, project status `READY`.
- **Resources** — add to task `READY`, view list `READY*`, search/filter `PARTIAL`, submit+approve `READY*`.
- **Tasks** — edit title/description `READY`, purpose/actions `PARTIAL`, additional resources `READY`,
  status set `READY`, N/A `READY*`, parent→children auto-complete `BLOCKED` (verify), dependency-confirm prompt
  `STALE` (phase-locking removed), assign lead `PARTIAL`, notes `PARTIAL`, email details `READY`.
- **Projects** — hierarchy `READY`, create from template `READY`, from scratch `READY*`, owned/joined lists `READY`,
  invite with role `READY`, manage users `READY`, role matrix `STALE` (Owner/Full/Limited/Coach → Admin/Planter/Team;
  delete Coach test), due-date engine `READY`, settings save `READY`, add custom/master task `READY`, delete `READY`.
- **Account** — creation `READY`, forgot password `READY*`, change email `PARTIAL`, change password `READY*`, login `READY`.

---

## Exploration goals (mission list for the exploratory agent)

Open-ended prompts an agent runs to *discover* problems static tests can't. Confirmed findings
**graduate into `@regression` specs above.** Run occasionally (not per-PR); output is a triage report.

1. **Date engine sweep** — On a dated project, edit start, due, and per-task offsets; reload after each.
   Report anything that (a) doesn't persist, (b) doesn't propagate to children, (c) produces an envelope
   where parent span ≠ min(child start)…max(child due). *(This is the pass that would have caught Tim's bug.)*
2. **Field round-trip sweep** — For every editable form (task, project, library item), edit each field,
   save, reload; report any field that silently drops its value (the add/edit parity class).
3. **Cross-project leakage** — As a planter in multiple projects, walk `/tasks` and every filtered view;
   report any task/milestone shown without a project label, or any view pulling across projects when it
   should be scoped.
4. **Role-gating probe** — As planter and team, attempt admin-only actions (delete task, approve resource,
   edit template, manage members); report anything reachable that shouldn't be.
5. **Clone fidelity** — Clone a template with resources, phases, and custom fields; diff the clone against
   the source; report anything stripped or mis-shifted (resource links, dates, task_type).
6. **"Should this work?" log** — Note any behavior that's not a bug but feels wrong or ambiguous, for human
   product review (the Tim/Patrick judgment layer).
