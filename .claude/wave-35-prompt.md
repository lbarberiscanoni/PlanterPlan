## Session Context

PlanterPlan is a church planting project management app (React 18 + TypeScript + Supabase + Vite). Read `CLAUDE.md` for conventions and architecture. Strict typing, Feature-Sliced Design (FSD) boundaries, no direct Supabase calls in components, no raw date math — all enforced. See `.gemini/styleguide.md` for the full bar.

Wave 34 shipped to `main`:
- `/admin` shell + global search
- User-management table
- Analytics dashboard + admin notifications on new project creation (closes the Wave 30 deferral)

**Roadmap note**: the original Wave 36 (under the pre-renumber plan) bundled Zoho CRM sync, AWS S3 uploads, ICS calendar feeds, and a generic webhook subscriber. Tasks 1, 2, and 4 were descoped; only **ICS calendar feeds** remain, and the surviving scope is tracked here as Wave 35. The wave is a single-task wave.

Wave 35 specific: zero existing-test impact (ICS feed is new + isolated). Run `npm test` and record the baseline.

## Pre-flight verification

1. `git log --oneline` includes the Wave 34 commits + docs sweep.
2. **No external prerequisites for ICS.**
3. **Cron scheduling** — Wave 35 adds no cron-driven function (ICS feed is pull-only, served on HTTP GET). `pg_cron` remains intentionally NOT enabled.
4. **Settings page tabs** — as of 2026-04-22 pre-flight, `src/pages/Settings.tsx` exposes three tabs typed at the top of the file: `'profile' | 'notifications' | 'security'`. Task 1 adds a fourth — `'integrations'` — matching the existing tab-render pattern; don't refactor the tab state shape beyond widening the union type.
5. **planterClient namespace** — confirm `planter.*` does NOT already include `integrations`. At 2026-04-22 the client exposes `auth`, `entities`, `rpc`, `functions`, `notifications`; Task 1 adds `integrations`.
6. **Spec anchor** — `spec.md` §3.7 currently contains `[ ] **External Integrations (ICS)**: ICS feeds for calendar integration.` Task 1's docs pass flips it.

## Branch

- Task 1 → `claude/wave-35-ics-feeds`

Open a PR to `main` after the task's verification gate passes. Do **not** push directly to `main`.

## Wave 35 scope

---

### Task 1 — ICS calendar feeds

**Commit:** `feat(wave-35): per-user signed ICS feed of upcoming tasks`

1. **Migration** (`docs/db/migrations/2026_04_18_ics_tokens.sql`, NEW)
   - `CREATE TABLE public.ics_feed_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, token text NOT NULL UNIQUE, label text, project_filter uuid[], created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, last_accessed_at timestamptz)`.
   - Index on `(token)` for the public lookup.
   - RLS: SELECT/INSERT/UPDATE/DELETE `user_id = auth.uid()`.
   - Mirror into `docs/db/schema.sql`.

2. **ICS feed edge function** (`supabase/functions/ics-feed/`, NEW: `index.ts` + `README.md`)
   - GET `/ics-feed?token=:token`. **Public** (unauthenticated — token is the credential).
   - Looks up token; if missing or `revoked_at IS NOT NULL`, returns 404.
   - Updates `last_accessed_at`.
   - Queries `tasks` for the token's `user_id` filtered by `assignee_id = user_id`, `due_date IS NOT NULL`, `due_date >= now() - 30 days`. Optional `project_filter` narrows by `root_id IN (...)`.
   - Renders an iCalendar (`.ics`) document — one VEVENT per task, with VALARM 1 day before. Use `text/calendar` content-type.

3. **Settings UI** (`src/pages/Settings.tsx`)
   - New "Integrations" tab with a "Calendar feeds" section.
   - "Generate new feed" button: prompts for label + project filter (multi-select of user's projects), generates a random 32-char token via `crypto.randomUUID()`-style helper, returns the iCal URL.
   - Lists existing feeds with copy-URL + revoke buttons.

4. **planterClient methods** (`src/shared/api/planterClient.ts`)
   - `integrations.listIcsFeedTokens()`, `integrations.createIcsFeedToken({ label, project_filter })`, `integrations.revokeIcsFeedToken(id)`.

5. **Architecture doc** (`docs/architecture/integrations.md`, NEW)
   - Sections: ICS Feeds (this task). Documents data flow, auth model, storage location, failure handling. (Future integrations can extend this doc.)

6. **Tests**
   - `Testing/unit/supabase/functions/ics-feed.test.ts` (NEW) — token lookup, 404 on revoked, ICS rendering correctness, project filter.
   - `Testing/unit/shared/api/planterClient.integrations.ics.test.ts` (NEW)

**DB migration?** Yes — one table.

**Out of scope:** Two-way calendar sync (Google Calendar / Outlook write-back) — that's a much larger integration, deferred. Per-task subscription / single-task .ics download (deferred — feed-only for this wave).

---

## Documentation Currency Pass (mandatory — before review)

1. **`spec.md`** — flip §3.7 "External Integrations (ICS)" from `[ ]` to `[x]`. Bump version. Update `Last Updated`.
2. **`docs/AGENT_CONTEXT.md`** — add "Integrations / ICS feed (Wave 35)" golden-path bullet.
3. **`docs/architecture/integrations.md`** is in.
4. **`docs/dev-notes.md`** — note: "**Active:** ICS feeds are read-only; two-way calendar sync deferred."
5. **`repo-context.yaml`** — bump `wave_status.current` to `Wave 35 (ICS Feeds)`, update `last_completed`, `spec_version`, add `wave_35_highlights:` block.
6. **`CLAUDE.md`** — add `ics_feed_tokens` to Tables.

Land docs as `docs(wave-35): documentation currency sweep`.

## Wave Review (mandatory — before commit + push to main)

1. **ICS feed** — generate a feed → copy URL → import into Google Calendar → tasks appear with correct due dates + reminders.
2. **Revocation** — revoke a feed token → subsequent fetches return 404.
3. **Project filter** — generate a feed with a single-project filter → confirm only that project's tasks appear.
4. **No FSD drift** — UI lives in `features/settings/`; data layer in `planterClient.integrations.*`; no shared imports back from features.
5. **Type drift** — new table hand-edited in `database.types.ts`; verify it matches the migration.
6. **Test-impact reconciled** — zero existing-test impact; ICS test parses generated `.ics` for structural correctness; no `it.skip`. Test count ≥ baseline + new tests.
7. **Lint + build + tests** — green per `.claude/wave-execution-protocol.md` §4.

## Commit & Push to Main (mandatory — gates Wave 36)

After the task merges:
1. `git checkout main && git pull && npm install && npm run lint && npm run build && npx vitest run`.
2. The history should show: 1 task commit + 1 docs sweep commit on top of Wave 34.
3. Push to `origin/main`. CI green.
4. **Do not start Wave 36** until the above is true.

## Verification Gate (before push)

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
- iCalendar (RFC 5545) reference — read before implementing

## Critical Files

**Will edit:**
- `docs/db/schema.sql` (mirror the new migration)
- `docs/AGENT_CONTEXT.md` (Wave 35 golden path)
- `docs/dev-notes.md` (ICS deferral note)
- `src/shared/db/database.types.ts` (new table)
- `src/shared/db/app.types.ts` (corresponding row type)
- `src/shared/api/planterClient.ts` (`integrations.*` namespace)
- `src/pages/Settings.tsx` (Integrations tab)
- `spec.md` (flip §3.7 External Integrations (ICS) to `[x]`)
- `repo-context.yaml` (Wave 35 highlights)
- `CLAUDE.md` (Tables — `ics_feed_tokens`)

**Will create:**
- `docs/db/migrations/2026_04_18_ics_tokens.sql`
- `docs/architecture/integrations.md`
- `supabase/functions/ics-feed/{index.ts,README.md}`
- Tests under `Testing/unit/...` mirroring the source paths (2 new test files)

**Explicitly out of scope this wave:**
- Zoho CRM sync (descoped)
- AWS S3 uploads (descoped)
- Generic webhook subscriber (descoped)
- Two-way calendar sync (Google / Outlook)
- Per-task single-task .ics download

## Ground Rules (non-negotiable — from `CLAUDE.md` + `.gemini/styleguide.md`)

TypeScript-only; no `.js` / `.jsx`; no barrel files (import directly from concrete paths); path alias `@/` → `src/`; no raw date math (ICS rendering uses `date-engine` for the DTSTART/DTEND ISO strings); no direct `supabase.from()` in components (`planterClient.integrations.*`); Tailwind utility classes only (no arbitrary values, no pure black — use `slate-900` / `zinc-900`); optimistic mutations must force-refetch on error; max subtask depth = 1; atomic revertable commits; build + lint + tests all clean before every push; DB migrations are additive-only.
