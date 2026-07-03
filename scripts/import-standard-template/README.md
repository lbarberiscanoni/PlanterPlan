# Standard Church Plant — prod reset + template import

One-off migration to wipe accumulated test/dummy data from production and import the
canonical church-planting template from `source.xlsx`.

**DESTRUCTIVE and irreversible (no backup).** Deletes all 79 instance projects, all 20
existing (junk) templates, and 15 non-admin/non-test auth users (including `hllbck7`).

## Files
- `source.xlsx` — the content (sheet `tasks in launch large`, 432 rows).
- `generate.py` — reads the xlsx, emits `standard-template.seed.sql` deterministically
  (stable `uuid5` ids). Re-run after editing the sheet: `python3 generate.py`.
- `standard-template.seed.sql` — GENERATED. Root + 432 tasks + 276 task_resources, inserted
  level-by-level. Wrapped in `BEGIN;`/`COMMIT;`.
- `wipe.sql` — Step 1 (wipe tasks) + Step 2 (delete users). Wrapped in `BEGIN;`/`COMMIT;`.

## Run order (against prod, as postgres)
```bash
# 0. (recommended) dry-run the seed first — swap COMMIT->ROLLBACK, confirm no errors:
sed 's/^COMMIT;$/ROLLBACK;/' standard-template.seed.sql | psql "$DB_URL"

# 1. wipe + delete users
psql "$DB_URL" -f wipe.sql
# 2. import template
psql "$DB_URL" -f standard-template.seed.sql
```
`$DB_URL` = the project's postgres connection string (pooler URL + password).

## What the seed provides / relies on
- Provides: `id, parent_task_id, creator, origin='template', title, purpose, description,
  actions, notes, position (per-sibling), status='todo', days_from_start, duration, settings`.
- Relies on triggers to set: `root_id`, `task_type` (depth-derived), `is_complete`, `updated_at`.
- Root `settings = {"published": true, "project_kind": "date"}`; creator = `timothy.cheung58@gmail.com`.
- Resources: external links → `task_resources` type `url`; legacy `/resources/item/N` +
  free text → one `text` row per task ("Legacy resources (needs curation)").

## Post-run verification
See the plan / conversation: task counts (433, all template, 1 root), task_type histogram
{project 1, phase 5, milestone 41, task 253, subtask 133}, max depth 4, 0 instance projects,
12 remaining users; then clone the template in-app to confirm it's structurally valid.
