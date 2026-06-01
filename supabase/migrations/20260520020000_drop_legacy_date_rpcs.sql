-- Drop the one-shot administrative RPCs that were pasted into Supabase Studio
-- during the depth-10 / waterfall-cascade transition earlier in this session.
-- They were never committed as migrations and are no longer called by the app:
--
--   * populate_project_dates_from_offsets(uuid) — bootstrapped dates from the
--     old offset-based template values. The waterfall trigger now populates
--     dates automatically.
--   * normalize_durations_from_offset_gaps(uuid) — converted the old offset
--     semantics into per-task durations. Run once on the two seeded projects;
--     no longer needed.
--   * reset_durations_to_one_day(uuid) — emergency reset for projects with
--     unreasonable inflated durations. Equivalent today is a manual SQL
--     UPDATE which a SECURITY DEFINER helper doesn't materially simplify.
--
-- IF EXISTS guards keep this migration idempotent across environments that
-- may or may not have had the Studio paste applied.

DROP FUNCTION IF EXISTS public.populate_project_dates_from_offsets(uuid);
DROP FUNCTION IF EXISTS public.normalize_durations_from_offset_gaps(uuid);
DROP FUNCTION IF EXISTS public.reset_durations_to_one_day(uuid);
