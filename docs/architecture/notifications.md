# Notification Stack (Wave 30)

Single source of truth for PlanterPlan's user-facing notification pipeline.
Every part of the stack — data model, triggers, transports, dispatchers,
scheduling, user preferences — is documented here. Refer to this file
before making changes to notification behavior.

Related:

* `docs/architecture/auth-rbac.md` — §"Notification Preferences (Wave 30)"
  covers the prefs/log RLS policies.
* `docs/operations/edge-function-schedules.md` — operator-facing cron
  recommendations for the four notification-related functions.

## Data model

| Table | Purpose |
| --- | --- |
| `public.notification_preferences` | One row per auth user. Bootstrap trigger (`trg_bootstrap_notification_prefs`) creates a row on signup with canonical defaults. Per-event email/push toggles, overdue-digest cadence (`off`/`daily`/`weekly`), quiet hours (start/end + IANA timezone). |
| `public.notification_log` | Append-only audit trail. `channel ∈ {'email','push'}`, `event_type` carries the state-machine phase (`mention_pending`, `mention_processing`, `mention_sent`, `mention_failed`, `mention_skipped`, `overdue_digest_sent`). RLS denies INSERT at policy level — only SECURITY DEFINER dispatch code writes. |
| `public.push_subscriptions` | One row per browser endpoint. `UNIQUE (user_id, endpoint)`. Client inserts on subscribe, DELETEs on unsubscribe. Dispatcher DELETEs stale rows on HTTP 410. |

## Triggers

### `trg_bootstrap_notification_prefs` (Wave 30 Task 1)

`AFTER INSERT ON auth.users → public.bootstrap_notification_prefs()`.
Inserts a default `notification_preferences` row for every new user.
`SECURITY DEFINER` because `auth.users` INSERTs happen inside Supabase
Auth's privileged context and the prefs row write crosses into a public
table.

### `trg_enqueue_comment_mentions` (Wave 30 Task 3)

`AFTER INSERT ON public.task_comments → public.enqueue_comment_mentions()`.
For each resolved uuid in `NEW.mentions` that is **not** `NEW.author_id`,
inserts a row:

```
notification_log (user_id, channel, event_type, payload)
VALUES (mention_uuid, 'email', 'mention_pending',
        jsonb_build_object('recipient_id', mention_uuid,
                           'actor_id', NEW.author_id,
                           'author_id', NEW.author_id,
                           'comment_id', NEW.id,
                           'task_id', NEW.task_id,
                           'project_id', NEW.root_id,
                           'root_id', NEW.root_id,
                           'body_preview', substring(NEW.body, 1, 140)))
```

The `channel` column is a placeholder — the dispatcher decides per
recipient whether email, push, or both fire. The trigger coerces
`mentions` strings to uuid via regex guard and logs a warning when invalid
entries are supplied. `resolveMentions` now returns an empty array and emits a
client warning when the handle RPC fails, so mention misses are observable
instead of being hidden by trigger-side invalid-value drops.

## Mention resolution

Client side: `src/features/tasks/lib/comment-mentions.ts`

```
extractMentions(body: string): string[]
  → matches /@([a-zA-Z0-9_.-]+)/g, dedups, lowercases

resolveMentions(handles: string[]): Promise<string[]>
  → RPC 'resolve_user_handles' → uuid[]
  → on RPC error, logs and returns [] so the comment still posts without
    silently enqueueing malformed mention payload
```

`CommentComposer.tsx` calls both in sequence on submit:
`extractMentions → resolveMentions → onSubmit(body, mentions)`. The
mutation persists `task_comments.mentions = uuid[]`. The `AFTER INSERT`
trigger then enqueues `mention_pending` rows.

## Transports

### Email — Resend via `supabase/functions/_shared/email.ts`

Wave 22 shipped the `sendEmail` wrapper + `renderSupervisorReportEmail`;
Wave 30 adds `renderOverdueDigestEmail` alongside. Requires
`EMAIL_PROVIDER_API_KEY` + `RESEND_FROM_ADDRESS`. Missing env →
`sendEmail` returns `{ ok: false, error: 'Email provider not configured' }`
and the dispatcher logs accordingly (degrades gracefully; doesn't throw).

### Push — Web Push via VAPID (`supabase/functions/dispatch-push/`)

Transport-only. Loaded by other functions (mention dispatcher, digest).
Requires `VAPID_PRIVATE_KEY` + `VITE_VAPID_PUBLIC_KEY` + `VAPID_SUBJECT`.
Service worker (`public/sw.js`) handles the browser side —
**documented JS exception** to the TS-only rule; TS conversion is not
currently scheduled (the PWA/workbox track that would have subsumed this
file was descoped during the post-Wave-31 roadmap renumber).
See `docs/dev-notes.md`.

`dispatch-push` contract: `{ user_ids, title, body, url?, tag?, event_type }`.
For each user/sub pair: send via web-push, DELETE on 410, log outcome.

## Dispatch state machine (mention path)

```
           ┌─────────────────────────────────────────────┐
           │                                             │
           │                     ┌──► mention_sent       │
           │                     │                       │
task_comments INSERT             ├──► mention_skipped    │
           │                     │    (pref_disabled |   │
           ▼                     │     quiet_hours |     │
  mention_pending ──► mention_processing │ prefs_missing)│
           ▲                     │                       │
           │                     └──► mention_failed     │
           │                                             │
           └─────────────────────────────────────────────┘
```

**Claim** (single-runner-wins):

```sql
UPDATE public.notification_log
SET event_type = 'mention_processing', sent_at = now()
WHERE id = $1 AND event_type = 'mention_pending'
RETURNING *
```

The `event_type = 'mention_pending'` match in WHERE means only the first
concurrent runner gets a row back. All others see `rowCount = 0` and move
on — idempotent under overlapping cron ticks without distributed locks.

**Terminal state**: `mention_sent` if any transport succeeded;
`mention_failed` if every enabled transport failed. Per-transport failure
reasons are concatenated into `notification_log.error` (debugging aid;
doesn't affect state).

**Skip reasons** (all land in `notification_log.error`):
* `prefs_missing` — recipient has no prefs row (should be impossible post-bootstrap).
* `quiet_hours` — local-now falls inside `[quiet_hours_start, quiet_hours_end]`
  in the recipient's `timezone` (wrap-across-midnight supported).
* `pref_disabled` — both `email_mentions = false` AND `push_mentions = false`.

## Overdue digest (separate dispatch)

`supabase/functions/overdue-digest/` — daily cron. Per user with
`email_overdue_digest != 'off'`:

1. If cadence is `'weekly'`, include only when Monday in user-tz (via
   `Intl.DateTimeFormat({ weekday: 'short', timeZone })` — no raw date math).
2. Query their assigned, not-complete, overdue tasks.
3. Skip silently if zero tasks.
4. Render + send via `renderOverdueDigestEmail` + `sendEmail`.
5. Log `overdue_digest_sent` with `{ cadence, task_count }` payload.

The digest is tz-aware by design: a user on PST who's set `weekly` will
get their email on their local Monday, not UTC Monday.

## Cron schedules

See `docs/operations/edge-function-schedules.md`:

* `dispatch-notifications` — every minute (tight mention latency).
* `overdue-digest` — 08:00 UTC daily (tz filter picks the right cohort).

Both functions are idempotent under any scheduler. `pg_cron` is
intentionally NOT enabled — operator picks between Supabase Scheduled
Triggers (preferred), GitHub Actions, or external pingers.

## User preferences UI

`src/pages/Settings.tsx` → Notifications tab (Wave 30 Task 1). Exposes:

* **Email** — Mentions toggle; Overdue Digest cadence select; Task
  Assignment toggle.
* **Push** — "Enable browser push" button (wires `usePushSubscription`);
  three push toggles (disabled until subscribed).
* **Quiet hours** — start/end time inputs + IANA timezone select.
* **Recent notifications** — collapsed `<details>` rendering
  `useNotificationLog({ limit: 20 })` for transparency.

## Debugging / ops

* **No notifications firing** — check `SUPABASE_SERVICE_ROLE_KEY` is set
  on each function; confirm `EMAIL_PROVIDER_API_KEY` + `RESEND_FROM_ADDRESS`
  for email; VAPID keys for push. Each missing env degrades to log-only
  with a canonical `error` string.
* **Specific user not receiving** — `SELECT * FROM notification_log
  WHERE user_id = '<uid>' ORDER BY sent_at DESC LIMIT 20`. The `error`
  column tells you which skip/fail branch fired.
* **Stale subscriptions** — `dispatch-push` auto-DELETEs on 410. If you
  see growing `push_subscriptions` row counts per user, the browser may
  not be returning 410 (dev environment quirk) — manual cleanup is
  `DELETE FROM push_subscriptions WHERE last_used_at < now() - interval '90 days'`.

## Admin new-project trigger (Wave 34)

Wave 34 Task 3 adds `trg_notify_admin_on_new_project` — AFTER INSERT on `public.tasks` WHEN `parent_task_id IS NULL AND origin = 'instance'`. The trigger function INSERTs one `notification_log` row per admin in `public.admin_users` (excluding the creator, if the creator is themselves an admin) with `event_type = 'admin_new_project_pending'` and `channel = 'email'`. Everything downstream — quiet-hours, per-admin opt-out, delivery retry — reuses the same `dispatch-notifications` cron pipeline this doc already covers.

Closes the "Admin Notifications" known-gap deferred from Wave 30. Migration: `docs/db/migrations/2026_04_18_new_project_admin_notify.sql`.
