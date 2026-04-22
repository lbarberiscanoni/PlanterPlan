# ics-feed

Wave 35 Task 1 — public ICS calendar feed endpoint.

## Endpoint

```
GET /functions/v1/ics-feed?token=<opaque-token>
```

Returns `text/calendar; charset=utf-8` (RFC 5545). The token *is* the credential — no Supabase auth header required. This is intentional: iCal consumers (Google Calendar, Outlook, Apple Calendar) subscribe via URL only.

## Behavior

- **404 for missing / revoked tokens.** Deliberately indistinguishable so rotation + unknown IDs leak no info.
- **`last_accessed_at` bumped** on every successful fetch (fire-and-forget — doesn't block the response).
- **Tasks returned** are the token owner's assigned tasks with a non-null `due_date` inside `[now - 30d, +∞)`. Optional `project_filter: uuid[]` on the token narrows by `root_id IN (...)`.
- **All-day VEVENT per task** (DATE value type on DTSTART / DTEND) + VALARM `-PT24H` reminder.
- Limited to 500 tasks per response to keep payload bounded.

## Deploy

Not currently scheduled / cron-bound — this is a pull endpoint. Deploy via:

```bash
supabase functions deploy ics-feed
```

No extra env vars: reuses the project's `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` injected by the Supabase runtime.

## Shared code

`index.ts` imports `renderIcsDocument` from `./ics.ts`. The renderer is pure (no Deno / Supabase imports) so vitest drives it from `Testing/unit/supabase/functions/ics-feed.test.ts` without spinning up the edge runtime.
