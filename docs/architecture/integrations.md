# docs/architecture/integrations.md

## Domain Overview

Third-party integrations that pull PlanterPlan data into external systems. Wave 35 introduces the first entry: **ICS calendar feeds**. Future integrations extend this doc — one section per integration, each documenting data flow + auth model + failure handling.

## ICS Calendar Feeds (Wave 35)

### Data model

`public.ics_feed_tokens` (migration `docs/db/migrations/2026_04_18_ics_tokens.sql`):

| Column | Notes |
| :--- | :--- |
| `id uuid` | Primary key. |
| `user_id uuid` | FK → `auth.users(id) ON DELETE CASCADE`. |
| `token text UNIQUE NOT NULL` | Opaque credential. Client-generated via `crypto.randomUUID()` × 2 (256-bit entropy). The token is the full credential — the edge function accepts it without any additional auth. |
| `label text` | Optional user-supplied name ("Work calendar"). |
| `project_filter uuid[]` | Optional — narrows the feed to tasks whose `root_id IN (...)`. NULL means "all projects I'm assigned tasks in". |
| `created_at`, `revoked_at`, `last_accessed_at` | Lifecycle. Revocation is soft (sets `revoked_at`) so audit trails via `last_accessed_at` stay intact. |

Indexes on `(token)` (public lookup) and `(user_id)` (per-user listing).

**RLS:** SELECT/UPDATE/DELETE allow `user_id = auth.uid()` (plus admin for SELECT/DELETE). INSERT requires the WITH CHECK to match `auth.uid()` — users can only create tokens for themselves.

### Edge function

`supabase/functions/ics-feed/` (`index.ts` + `ics.ts` + `README.md`):

- **Endpoint:** `GET /functions/v1/ics-feed?token=<opaque>`. Public (no Supabase auth header). 404 on missing or revoked tokens — deliberately indistinguishable so rotation doesn't leak info.
- **Task query:** token owner's `assignee_id` rows, `due_date` non-null, `due_date >= now() - 30 days`. Optional `project_filter` narrows by `root_id IN (...)`. Capped at 500 rows.
- **Rendering:** pure `renderIcsDocument` in `ics.ts` (no Deno imports, so vitest drives it). RFC 5545 VCALENDAR with one all-day VEVENT per task + VALARM `-PT24H` reminder. RFC escaping + 75-octet line folding implemented in helpers.
- **Side effect:** fire-and-forget UPDATE on `last_accessed_at`. Doesn't block the response.
- **Response headers:** `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=300`, `Content-Disposition: inline; filename="planterplan.ics"`.

Not scheduled / cron-bound — pull-only.

### App layer

`planter.integrations.*` namespace in `src/shared/api/planterClient.ts`:

| Method | Purpose |
| :--- | :--- |
| `listIcsFeedTokens()` | User's tokens, active + revoked, newest first. |
| `createIcsFeedToken({ label?, project_filter? })` | Client generates `token` via `crypto.randomUUID()` (×2 for 256-bit entropy). Inserts row. Returns the full row (including the plaintext token — **only** ever returned here, never re-fetched). |
| `revokeIcsFeedToken(id)` | Sets `revoked_at = now()`. Soft. |

UI: `src/features/settings/components/IcsFeedsCard.tsx`, mounted in the new Settings → Integrations tab. Copy-URL + Revoke actions per row. Revoked rows stay visible for audit but their copy button is disabled.

### Auth model + failure handling

The token *is* the credential. A revoked token returns 404 indistinguishably from an unknown one — rotation is the only revocation story (no token-specific error page). Users should treat the feed URL as sensitive; the IcsFeedsCard warning copy says so.

If the edge function's Supabase client errors (malformed query / network hiccup), it returns HTTP 500 with no body rather than leaking Supabase error text. Internal logs capture the detail.

### Out of scope

- **Two-way sync** (writing back from Google Calendar / Outlook → PlanterPlan). A much bigger integration; deferred with no wave assigned.
- **Single-task subscription** (fetch one task's .ics rather than the full feed). Deferred.
- **HMAC-signed URLs** with server-enforced expiry. The opaque-token model is the Wave 35 baseline; expiry + signature rotation is a future iteration.
