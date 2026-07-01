-- task_relationships shipped with RLS policies ("View relationships" /
-- "Manage relationships") but NO table-level GRANTs, so every PostgREST call
-- (read and write) returned 403 for all roles — the task-dependencies feature
-- was fully non-functional. RLS restricts; it does not grant. Issue the
-- privileges the RLS policies are meant to gate.
--
-- Surfaced 2026-07-01: the deps panel's read went through a never-created
-- get_task_relationships RPC (404) which masked that writes were also 403.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_relationships TO authenticated;
GRANT ALL ON public.task_relationships TO service_role;
