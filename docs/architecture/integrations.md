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
| `token text UNIQUE NOT NULL` | Opaque credential. Client-generated with Web Crypto (`crypto.getRandomValues`, 32 bytes / 256-bit entropy). The token is the full credential — the edge function accepts it without any additional auth. |
| `label text` | Optional user-supplied name ("Work calendar"). |
| `project_filter uuid[]` | Optional — narrows the feed to tasks whose `root_id IN (...)`. NULL means "all projects I'm assigned tasks in". |
| `created_at`, `revoked_at`, `last_accessed_at` | Lifecycle. Revocation is soft (sets `revoked_at`) so audit trails via `last_accessed_at` stay intact. |

Indexes on `(token)` (public lookup) and `(user_id)` (per-user listing).

**RLS + trigger guard:** SELECT allows `user_id = auth.uid()` (plus admin). INSERT requires the WITH CHECK to match `auth.uid()` — users can only create tokens for themselves. UPDATE is limited by `trg_enforce_ics_feed_token_update_scope`: authenticated users may only move their own active token from `revoked_at IS NULL` to revoked, and may not mutate token credentials, owner, label, project filter, created timestamp, or access audit fields. DELETE is admin/service-role only so user-facing lifecycle stays soft-revocation and `last_accessed_at` audit history is not erased by client payloads.

### Edge function

`supabase/functions/ics-feed/` (`index.ts` + `ics.ts` + `README.md`):

- **Endpoint:** `GET /functions/v1/ics-feed?token=<opaque>`. Public (no Supabase auth header). 404 on missing or revoked tokens — deliberately indistinguishable so rotation doesn't leak info.
- **Task query:** token owner's `assignee_id` rows, intersected with the owner's current `project_members` memberships, `due_date` non-null, `due_date >= now() - 30 days`. Optional `project_filter` narrows within that membership scope by `root_id IN (...)`. Capped at 500 rows.
- **Rendering:** pure `renderIcsDocument` in `ics.ts` (no Deno imports, so vitest drives it). RFC 5545 VCALENDAR with one all-day VEVENT per task + VALARM `-PT24H` reminder. RFC escaping + 75-octet line folding implemented in helpers. All-day `DTEND` is an exclusive calendar rendering boundary and therefore uses the edge `calendarDayBusinessCalendar`, not date-project business-day scheduling.
- **Side effect:** awaited UPDATE on `last_accessed_at`. Deno edge runtimes can cancel unawaited promises after returning a response, so the access audit stamp is intentionally part of the success path; stamp failures are logged but do not fail the feed response.
- **Response headers:** `Content-Type: text/calendar; charset=utf-8`, `Cache-Control: private, max-age=300`, `Content-Disposition: inline; filename="planterplan.ics"`.

Not scheduled / cron-bound — pull-only.

### App layer

`planter.integrations.*` namespace in `src/shared/api/planterClient.ts`:

| Method | Purpose |
| :--- | :--- |
| `listIcsFeedTokens()` | User's tokens, active + revoked, newest first. |
| `createIcsFeedToken({ label?, project_filter? })` | Client generates `token` via Web Crypto (`crypto.getRandomValues`, 32 bytes / 256-bit entropy). Inserts row. Returns the full row including the plaintext token so the user can copy the feed URL. |
| `revokeIcsFeedToken(id)` | Sets `revoked_at = now()`. Soft. |

UI: `src/features/settings/components/IcsFeedsCard.tsx`, mounted in the new Settings → Integrations tab. Copy-URL + Revoke actions per row. Revoked rows stay visible for audit but their copy button is disabled.

### Auth model + failure handling

The token *is* the credential. A revoked token returns 404 indistinguishably from an unknown one — rotation is the only revocation story (no token-specific error page). Users should treat the feed URL as sensitive; the IcsFeedsCard warning copy says so.

If the edge function's Supabase client errors (malformed query / network hiccup), it returns HTTP 500 with no body rather than leaking Supabase error text. Internal logs capture the detail.

### Out of scope

- **Two-way sync** (writing back from Google Calendar / Outlook → PlanterPlan). A much bigger integration; deferred with no wave assigned.
- **Single-task subscription** (fetch one task's .ics rather than the full feed). Deferred.
- **HMAC-signed URLs** with server-enforced expiry. The opaque-token model is the Wave 35 baseline; expiry + signature rotation is a future iteration.
