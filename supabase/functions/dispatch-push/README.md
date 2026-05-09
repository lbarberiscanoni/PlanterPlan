# dispatch-push (Wave 30)

Web Push fan-out edge function. Called from other edge functions (Task 3's
`dispatch-notifications` + `overdue-digest`) — **not** from the browser.

## Contract

```ts
POST { user_ids: string[], title: string, body: string, url?: string, tag?: string, event_type: 'mentions' | 'overdue' | 'assignment' }
→ { success: true, sent: number, skipped: number, failed: number }
```

## Pre-flight per dispatch

For every user in `user_ids`:
1. Load `notification_preferences.push_<event_type>` — skip with
   `error = 'pref_disabled'` when false.
2. Check the user's `quiet_hours_start` / `quiet_hours_end` in their
   `timezone` via `Intl.DateTimeFormat` — skip with `error = 'quiet_hours'`.
3. Load every `push_subscriptions` row and send one push per subscription
   via `web-push@3.6.7` (ESM from esm.sh).
4. On `statusCode === 410 | 404`: DELETE the stale subscription row and log
   `error = '410_gone'`. On other failures: log `error = <status | message>`.
5. On success: log the `x-message-id` response header as `provider_id`.

All log rows go into `public.notification_log` (SECURITY DEFINER —
the function uses `SUPABASE_SERVICE_ROLE_KEY`).

## Required environment

| Variable | Scope | Description |
| --- | --- | --- |
| `SUPABASE_URL` | function | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | function (secret) | Service-role key; bypasses RLS for cross-user reads + log inserts. |
| `VITE_VAPID_PUBLIC_KEY` | function | VAPID public key (same value the browser bundles). |
| `VAPID_PRIVATE_KEY` | function (secret) | VAPID private key — **never committed**. |
| `VAPID_SUBJECT` | function | `mailto:ops@planterplan.example` (contact for push-service operators). |

Generate VAPID keys once: `npx web-push generate-vapid-keys`. Put the public
key in `.env.example` (shipped to the bundle as `VITE_VAPID_PUBLIC_KEY`);
the private key is a Supabase secret only.

When any VAPID env is missing the function short-circuits before transport and
returns `{ success: false, error: 'vapid_unconfigured' }` to its service-role
caller. The caller (`dispatch-notifications` / `overdue-digest`) owns the
terminal `notification_log` row so one misconfigured fan-out cannot create
duplicate per-user transport logs.

## Scheduling

Not scheduled. Invoked by other edge functions only. Schedule the callers
(Task 3) — `dispatch-notifications` on a 1-minute interval,
`overdue-digest` daily/weekly.

**`pg_cron` is intentionally NOT enabled in this codebase.** Use:
- Supabase Dashboard → Scheduled Triggers (preferred), OR
- GitHub Actions cron POSTing the function URL, OR
- An external pinger (`cron-job.org`, etc.).

## Local smoke

```bash
supabase functions serve dispatch-push --env-file ./supabase/.env.local

curl -X POST http://127.0.0.1:54321/functions/v1/dispatch-push \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "user_ids": ["<uid>"], "title": "Hello", "body": "World", "event_type": "mentions" }'
```

Expect `{ success: true, sent: 1, skipped: 0, failed: 0 }` when the target
user has a valid subscription, `push_mentions = true`, and isn't in quiet
hours.
