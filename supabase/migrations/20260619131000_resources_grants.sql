-- Grant table privileges on public.resources to the API roles. The catalog
-- migration created the table via raw SQL, which does not inherit Supabase's
-- default grants, so PostgREST returned 403 before RLS was evaluated. RLS still
-- gates row access (all-read for authenticated, admin-only writes).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO service_role;
