## Session Context

PlanterPlan is a church planting project management app (React 18 + TypeScript + Supabase + Vite). Read `CLAUDE.md` for conventions and architecture. Strict typing, Feature-Sliced Design (FSD) boundaries, no direct Supabase calls in components, no raw date math — all enforced. See `.gemini/styleguide.md` for the full bar.

Wave 35 shipped to `main`:
- Per-user signed ICS calendar feeds

**Roadmap note**: the pre-renumber Wave 37 scope included five hardening items. Date-engine weekends/holidays, invite escrow, and task-tree virtualization were descoped. Only **template versioning** and **template immutability** remain, and the surviving scope is tracked here as Wave 36. The original Wave 38 release-cutover wave was also descoped, so Wave 36 is the trailing wave in the active roadmap.

The known-gaps list this wave attacks (sourced from `docs/architecture/*.md` + `docs/dev-notes.md` + `repo-context.yaml`):

1. **`library-templates.md`**: Versioning of templates — currently, if an Admin updates a Template, existing Projects created from it are not updated (intended), but tracking the original template version on the Project instance is missing.
2. **`projects-phases.md`**: Template Immutability — Logic to prevent users from deleting specific items that originated from a Master Template (allowing deletion only for custom post-instantiation additions) is not yet fully enforced.

**Test baseline going into Wave 36:** Run `npm test` and record. Lint baseline: 0 errors, ≤7 warnings — do not regress. This wave adds no new functional surfaces — just hardening — so the test count delta is modest.

**Read `.claude/wave-testing-strategy.md` before starting.** Wave 36 specific: Tasks 1 + 2 modify the `clone_project_template` RPC server-side. The existing `Testing/unit/shared/api/planterClient.clone.stamp.test.ts` test (Wave 22) asserts that `Task.clone` follows up with a `Task.update` writing `settings.spawnedFromTemplate`. Read this file first — if Task 1's stamp of `cloned_from_template_version` is added on the server side (in the RPC body) rather than the client-side follow-up, the existing test stays unchanged. Task 2's `cloned_from_task_id` populates server-side too, so client-side test is also unchanged. Add NEW assertions for both stamps in `Testing/unit/shared/api/planterClient.template.versioning.test.ts`.

## Pre-flight verification (run before any task)

1. `git log --oneline` includes the Wave 35 commit + docs sweep (not Wave 36 — this **is** Wave 36).
2. The existing tasks-table columns: `is_locked`, `prerequisite_phase_id`, `task_type` (Wave 25 — migration `docs/db/migrations/2026_04_18_task_type_discriminator.sql`), `template_version` (NOT YET — Task 1 adds), `cloned_from_task_id` (NOT YET — Task 2 adds). Verify the absence via `grep -E 'template_version|cloned_from_task_id' docs/db/schema.sql` — both should return nothing.
3. The existing `clone_project_template` RPC exists in `docs/db/schema.sql` (lines ~257-472 as of Wave 23) with the signature `(p_template_id uuid, p_new_parent_id uuid, p_new_origin text, p_user_id uuid, p_title text DEFAULT NULL, p_description text DEFAULT NULL, p_start_date date DEFAULT NULL, p_due_date date DEFAULT NULL)`. Tasks 1 + 2 modify this RPC carefully (preserve the signature).
4. **Task 1 admin UI dependency** — Task 1's Admin Templates UI (`src/pages/admin/AdminTemplates.tsx`) extends the `/admin` shell that Wave 34 created. Wave 34 **must** be merged before starting Wave 36 Task 1's UI changes; if `src/pages/admin/` does not exist, HALT and surface — this wave depends on that shell.
5. **Architecture doc gaps** — verify both known-gap anchors are still present before flipping them:
   - `docs/architecture/library-templates.md` has a "Versioning of templates" open gap.
   - `docs/architecture/projects-phases.md` has a "Template Immutability" open gap.
   If either is already marked Resolved, the wave plan has drifted — HALT.

## Branch

One branch per task, cut from `main`:
- Task 1 → `claude/wave-36-template-versioning`
- Task 2 → `claude/wave-36-template-immutability`

Open a PR to `main` after each task's verification gate passes. Do **not** push directly to `main`.

## Wave 36 scope

Two tasks, each closing one documented known-gap. Each task is intentionally tight — no task should produce a PR over ~500 LOC.

---

### Task 1 — Template versioning

**Commit:** `feat(wave-36): stamp template version on cloned instances + admin version log`

1. **Migration** (`docs/db/migrations/2026_04_18_template_versioning.sql`, NEW)
   - Add column `template_version int NOT NULL DEFAULT 1` to `public.tasks` (only meaningful on `origin = 'template'` rows).
   - On every UPDATE to a template task (text/structure changes), increment `template_version`. Trigger: `BEFORE UPDATE ON public.tasks WHEN OLD.origin = 'template' AND NEW.origin = 'template'` and any of `(title, description, days_from_start, duration, settings)` changed → `NEW.template_version = OLD.template_version + 1`.
   - Stamp the cloned root with the source template's version: in the `clone_project_template` RPC (existing), when cloning, copy `source.template_version` into the cloned root's `settings.cloned_from_template_version`.
   - **Don't** propagate updates to existing instances (intended behavior per the architecture doc) — this wave just makes the version trackable.
   - Mirror into `docs/db/schema.sql`.

2. **Admin Templates UI** (`src/pages/admin/AdminTemplates.tsx` — extend existing or NEW if absent)
   - Show `template_version` in the template list.
   - Per-instance view (drilldown): "Projects cloned from this template" list with each instance's `cloned_from_template_version` so admins can spot stale clones.

3. **Architecture doc** (`docs/architecture/library-templates.md`)
   - Flip "Versioning of templates" known-gap to **Resolved (Wave 36)**. Document the trigger + the stamp on clone + the deliberate non-propagation.

4. **Tests**
   - `Testing/unit/shared/api/planterClient.template.versioning.test.ts` (NEW) — `Task.update` on a template increments version; `Task.clone` stamps `settings.cloned_from_template_version`.
   - Manual `psql` smoke at `docs/db/tests/template_versioning.sql` — increment behavior + clone stamp.

**DB migration?** Yes — one column + one trigger + one RPC modification.

**Out of scope:** UI to "update this project to the latest template version" (deferred — would require a complex three-way merge; intentional non-propagation per architecture doc). Per-task versioning (only template-roots get version stamps — sub-task versioning is too granular for v1).

---

### Task 2 — Template immutability (origin tracking on cloned tasks)

**Commit:** `feat(wave-36): track template-origin on cloned tasks + UI guard against deletion`

1. **Migration** (`docs/db/migrations/2026_04_18_task_template_origin.sql`, NEW)
   - Add column `cloned_from_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL` to `public.tasks`. Stamped during `clone_project_template`. NULL means "post-instantiation custom addition".
   - Index on `cloned_from_task_id`.
   - Modify `clone_project_template` RPC: every cloned task carries the source task's id in `cloned_from_task_id`.
   - Backfill: NULL for all existing rows (we don't have provenance for them; document this in the migration header).
   - Mirror into `docs/db/schema.sql`.

2. **App-side delete guard** (`src/features/tasks/components/TaskDetailsView.tsx`, `src/features/tasks/hooks/useTaskMutations.ts`)
   - When the user attempts to delete a task with `cloned_from_task_id IS NOT NULL` AND they are NOT the project owner: surface a modal: "This task originated from the project template. Only the project owner can delete template-origin tasks." Cancel / "Delete anyway" (owner-only).
   - When the user IS the owner: proceed without the modal (owners can delete anything).

3. **Visual indicator** (`src/features/tasks/components/TaskItem.tsx`)
   - Subtle "T" badge on rows with `cloned_from_task_id IS NOT NULL` — tooltip: "From template".

4. **Architecture doc** (`docs/architecture/projects-phases.md`)
   - Flip the "Template Immutability" known-gap to **Resolved (Wave 36)**. Document the new column + the UI gate + the owner-bypass.

5. **Tests**
   - `Testing/unit/features/tasks/components/TaskDetailsView.deleteGuard.test.tsx` (NEW) — modal appears for non-owners on template-origin tasks; bypassed for owners; not shown on custom additions.
   - Manual `psql` smoke at `docs/db/tests/task_template_origin.sql` — clone a project; every task has `cloned_from_task_id` populated. Add a custom task; `cloned_from_task_id IS NULL`.

**DB migration?** Yes — one column + RPC modification.

**Out of scope:** Server-side enforcement of the delete restriction (the UI gate is enough for v1; a server-side guard would require a per-row policy that's brittle — the owner-bypass behavior is more naturally expressed in app code). Tracking edits to template-origin tasks (deferred — only deletion is gated for v1).

---

## Documentation Currency Pass (mandatory — before review)

1. **`spec.md`** — append a short note in §3.8 "Technical Hardening & Infrastructure": "Wave 36 closed two architecture-doc known-gaps (template versioning, template immutability)." Bump version. Update `Last Updated`.
2. **`docs/AGENT_CONTEXT.md`** — add "Hardening Pass (Wave 36)" golden-path bullet listing the two subsurfaces.
3. **`docs/architecture/library-templates.md`** — template-versioning gap → Resolved.
4. **`docs/architecture/projects-phases.md`** — template-immutability gap → Resolved.
5. **`docs/dev-notes.md`** — confirm currency. Note the two remaining architecture-doc known-gaps that stay open (date-engine weekends/holidays, invite escrow) now that the wrapping wave was descoped.
6. **`repo-context.yaml`** — bump `wave_status.current` to `Wave 36 (Template Hardening)`, update `last_completed`, `spec_version`, add `wave_36_highlights:` block.
7. **`CLAUDE.md`** — note the new `template_version` and `cloned_from_task_id` columns on `tasks`.

Land docs as `docs(wave-36): documentation currency sweep`.

## Wave Review (mandatory — before commit + push to main)

1. **Template versioning** — edit a template → `template_version` increments. Clone → `settings.cloned_from_template_version` matches the new version. Edit again → existing instance's stamp does NOT update (intentional).
2. **Template immutability** — clone a project → every task has `cloned_from_task_id`. As editor (not owner), attempt to delete a template-origin task → modal blocks. As owner → proceeds.
3. **No FSD drift** — every new file lives in the right slice. Helpers in `lib/`, hooks in `hooks/`, components in `components/`. No barrel files. No `shared/` → `features/` imports.
4. **Type drift** — `database.types.ts` hand-edited cleanly across the two migrations.
5. **Test-impact reconciled** — Wave 22 `planterClient.clone.stamp.test.ts` stays green (Tasks 1+2 stamps happen server-side in the RPC); no `it.skip`. Test count ≥ baseline + new tests.
6. **Lint + build + tests** — green per `.claude/wave-execution-protocol.md` §4 (HALT on any failure).

## Commit & Push to Main (mandatory)

After both Tasks merge:
1. `git checkout main && git pull && npm install && npm run lint && npm run build && npx vitest run`.
2. The history should show: 2 task commits + 1 docs sweep commit on top of Wave 35.
3. Push to `origin/main`. CI green.

## Verification Gate (per task, before push)

**Every command below is a HALT condition per `.claude/wave-execution-protocol.md` §4.**

```bash
npm run lint      # 0 errors required (≤7 pre-existing warnings tolerated). FAIL → HALT.
npm run build     # clean (tsc -b && vite build). FAIL → HALT.
npm test          # 100% pass rate; count ≥ baseline + new tests. FAIL → HALT.
git status        # clean
```

Manual smoke per Wave Review.

## Key references

- `CLAUDE.md` — conventions, commands, architecture overview
- `.gemini/styleguide.md` — strict typing, FSD boundaries, Tailwind constraints, no arbitrary values
- `docs/architecture/library-templates.md` — Task 1 host
- `docs/architecture/projects-phases.md` — Task 2 host
- `src/shared/api/planterClient.ts` (`Task.clone`) — Tasks 1 + 2 hooks

## Critical Files

**Will edit:**
- `docs/db/schema.sql` (mirror two new migrations)
- `docs/architecture/library-templates.md` / `projects-phases.md` (2 known-gaps → Resolved)
- `docs/AGENT_CONTEXT.md` (Wave 36 golden path)
- `docs/dev-notes.md` (remaining open gaps noted)
- `src/shared/db/database.types.ts` (new columns on `tasks`)
- `src/shared/db/app.types.ts` (corresponding row types)
- `src/shared/api/planterClient.ts` (template clone version stamping)
- `src/features/tasks/components/TaskDetailsView.tsx` (delete guard)
- `src/features/tasks/hooks/useTaskMutations.ts` (delete guard wiring)
- `src/features/tasks/components/TaskItem.tsx` (template badge)
- `src/pages/admin/AdminTemplates.tsx` (extend or create — version column + cloned-from drilldown)
- `spec.md` (§3.8 hardening note)
- `repo-context.yaml` (Wave 36 highlights)
- `CLAUDE.md` (Tables — note new `tasks` columns)

**Will create:**
- `docs/db/migrations/2026_04_18_template_versioning.sql`
- `docs/db/migrations/2026_04_18_task_template_origin.sql`
- `docs/db/tests/template_versioning.sql`
- `docs/db/tests/task_template_origin.sql`
- Tests under `Testing/unit/...` (2 new test files)

**Explicitly out of scope this wave:**
- Date-engine weekends + holidays (descoped — open gap stays open)
- Invite escrow for non-signed-up emails (descoped — open gap stays open)
- Task-tree virtualization for 1000+ tasks (descoped — stays in tech-debt)
- Template "update this project to latest version" UI
- Server-side enforcement of template-origin delete (UI gate only for v1)

## Ground Rules (non-negotiable — from `CLAUDE.md` + `.gemini/styleguide.md`)

TypeScript-only; no `.js` / `.jsx`; no barrel files (import directly from concrete paths); path alias `@/` → `src/`; no raw date math; no direct `supabase.from()` in components; Tailwind utility classes only (no arbitrary values, no pure black — use `slate-900` / `zinc-900`); optimistic mutations must force-refetch on error; max subtask depth = 1; template vs instance clarified on any cross-cutting work — Tasks 1 + 2 are this wave's most cross-cutting work and depend on the `origin` field everywhere; atomic revertable commits; build + lint + tests all clean before every push; DB migrations are additive-only.
