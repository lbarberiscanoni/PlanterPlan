# ics-feed

Wave 35 Task 1 — public ICS calendar feed endpoint.

## Endpoint

```
GET /functions/v1/ics-feed?token=<opaque-token>
```

Returns `text/calendar; charset=utf-8` (RFC 5545). The token *is* the credential — no Supabase auth header required. This is intentional: iCal consumers (Google Calendar, Outlook, Apple Calendar) subscribe via URL only.

## Behavior

- **404 for missing / revoked tokens.** Deliberately indistinguishable so rotation + unknown IDs leak no info.
- **`last_accessed_at` bumped** on every successful fetch. The update is awaited because Deno edge runtimes can cancel unawaited promises once the response is returned; stamp failures are logged and do not fail the feed response.
- **Tasks returned** are the token owner's assigned tasks, intersected with current project membership, with a non-null `due_date` inside `[now - 30d, +∞)`. Optional `project_filter: uuid[]` on the token narrows within that membership scope by `root_id IN (...)`.
- **All-day VEVENT per task** (DATE value type on DTSTART / DTEND) + VALARM `-PT24H` reminder. `DTEND` advances by one literal calendar day via `calendarDayBusinessCalendar`; it does not use date-project business-day scheduling.
- Limited to 500 tasks per response to keep payload bounded.

## Deploy

Not currently scheduled / cron-bound — this is a pull endpoint. Deploy via:

```bash
supabase functions deploy ics-feed
```

No extra env vars: reuses the project's `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` injected by the Supabase runtime.

## Shared code

`index.ts` injects the Supabase service-role client into `handleIcsFeedRequest` from `./handler.ts`. The handler and renderer are pure enough for Vitest to drive from `Testing/unit/supabase/functions/ics-feed.handler.test.ts` and `Testing/unit/supabase/functions/ics-feed.test.ts` without spinning up the edge runtime.
