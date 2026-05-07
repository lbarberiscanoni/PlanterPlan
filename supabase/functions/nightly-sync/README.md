# nightly-sync

Supabase Edge Function that transitions task statuses and spawns recurring
tasks on a schedule:

1. **Overdue**: any task with `due_date < now`, `is_complete = false`, and
   `status NOT IN ('completed', 'overdue')` is set to `status = 'overdue'`.
2. **Due Soon**: any task with `due_date >= now`, `is_complete = false`, and
   `status NOT IN ('completed', 'overdue', 'due_soon')` whose `due_date` falls
   within its project root's `settings.due_soon_threshold` (date-project
   business days, default `3`) is set to `status = 'due_soon'`. Date-project
   business days use the edge `dateProjectBusinessCalendar`
   (`us-federal-observed`) and preserve the UTC time-of-day for the cutoff.
3. **Recurrence (Wave 21)**: template tasks with a valid `settings.recurrence`
   rule that fires today (evaluated in UTC) are cloned into the configured
   target project via the `clone_project_template` RPC. The clone is stamped
   with `settings.spawnedFromTemplate` + `settings.spawnedOn` so same-day
   re-invocations of the function are a no-op. Rule shape (see
   `supabase/functions/_shared/recurrence.ts`):
   - `{ kind: 'weekly', weekday: 0..6, targetProjectId }`
   - `{ kind: 'monthly', dayOfMonth: 1..28, targetProjectId }`

## Response

```json
{
  "success": true,
  "overdue": 4,
  "due_soon": 9,
  "recurrence_spawned": 1,
  "recurrence_skipped": 0,
  "overdue_ids": ["..."],
  "due_soon_ids": ["..."],
  "recurrence_spawned_ids": ["..."]
}
```

## Known trade-off

Both transitions overwrite `status`, which is a mixed-dimension field (it
carries both work status — `todo` / `in_progress` / `blocked` — and urgency
— `overdue` / `due_soon`). A task actively `in_progress` whose due_date
crosses the threshold will silently lose the `in_progress` signal. This is a
pre-existing constraint of the data model and is not addressed in Wave 20.

## Local smoke test

```bash
# 1. Serve the function locally
npx supabase functions serve nightly-sync

# 2. Invoke it
curl -i -X POST http://127.0.0.1:54321/functions/v1/nightly-sync \
  -H "Authorization: Bearer $(npx supabase status -o json | jq -r .services.SERVICE_ROLE_KEY)"

# 3. Inspect rows
#    Studio: http://127.0.0.1:54323
#    SELECT id, status, due_date FROM tasks WHERE status IN ('overdue', 'due_soon');
```

## Scheduling (operator)

This repository intentionally does **not** enable `pg_cron` or auto-register a
schedule. Enabling `pg_cron` touches the managed Supabase instance and is left
to the operator to wire up manually. The recommended options, from simplest to
most flexible:

1. **Supabase dashboard cron (pg_cron)**: In Studio → Database → Extensions,
   enable `pg_cron`, then schedule via SQL:

   ```sql
   select cron.schedule(
     'nightly-sync',
     '0 5 * * *',  -- 05:00 UTC daily
     $$
       select net.http_post(
         url := 'https://<project-ref>.functions.supabase.co/nightly-sync',
         headers := jsonb_build_object(
           'Authorization', 'Bearer <service-role-jwt>',
           'Content-Type',  'application/json'
         )
       ) as request_id;
     $$
   );
   ```

2. **External scheduler (GitHub Actions, cron-job.org, etc.)**: POST to the
   deployed function URL on whatever schedule your ops workflow prefers.

3. **Supabase CLI**: `supabase functions deploy nightly-sync` and then schedule
   via any of the methods above against the deployed URL.
