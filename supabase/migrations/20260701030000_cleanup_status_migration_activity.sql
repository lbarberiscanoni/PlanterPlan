-- Cleanup for the side-effect of 20260701020000_normalize_task_status.sql.
--
-- That migration's bulk UPDATE fired the log_task_change trigger once per
-- touched row, injecting ~1393 rows into the append-only activity_log and
-- burying the admin Recent Activity feed with migration noise.
--
-- This deletes ONLY those migration-generated rows. Real status changes are
-- always performed by a logged-in user (non-null actor_id), so the signature
-- below — null actor + action 'status_changed' on a task, on the migration
-- date — is exclusive to the bulk migration. Verified at authoring time: zero
-- pre-existing rows match it. Idempotent (re-running deletes nothing further).
--
-- Applied deliberately by the operator via `supabase db push` — deleting from
-- an append-only audit trail is intentional and scoped, not automated cleanup.

DELETE FROM public.activity_log
 WHERE actor_id IS NULL
   AND action = 'status_changed'
   AND entity_type = 'task'
   AND created_at >= '2026-07-01'::date
   AND created_at <  '2026-07-02'::date;
