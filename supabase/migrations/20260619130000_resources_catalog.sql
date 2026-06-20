-- Admin-curated global Resources catalog.
--
-- A single flat table of named links (the "PlanterPlan Resources" library):
-- name/alias + URL. Resource TYPE is derived from the URL client-side
-- (detectResourceKind) — no type column. Every authenticated user can read and
-- search the catalog; only admins may add / edit / remove entries.

CREATE TABLE IF NOT EXISTS public.resources (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    url         text NOT NULL,
    created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_created_at ON public.resources (created_at DESC);

-- Table-level privileges for the API roles (RLS still gates row access). A table
-- created via raw SQL migration does NOT inherit Supabase's default grants, so
-- without these PostgREST returns 403 before any policy is evaluated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO service_role;

-- Reuse the shared updated_at trigger fn (also used by public.tasks).
DROP TRIGGER IF EXISTS trg_resources_updated_at ON public.resources;
CREATE TRIGGER trg_resources_updated_at
    BEFORE UPDATE ON public.resources
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (the catalog is a global, all-users library).
DROP POLICY IF EXISTS resources_select_authenticated ON public.resources;
CREATE POLICY resources_select_authenticated ON public.resources
    FOR SELECT TO authenticated
    USING (true);

-- Write: admins only.
DROP POLICY IF EXISTS resources_admin_insert ON public.resources;
CREATE POLICY resources_admin_insert ON public.resources
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS resources_admin_update ON public.resources;
CREATE POLICY resources_admin_update ON public.resources
    FOR UPDATE TO authenticated
    USING (public.is_admin((SELECT auth.uid())))
    WITH CHECK (public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS resources_admin_delete ON public.resources;
CREATE POLICY resources_admin_delete ON public.resources
    FOR DELETE TO authenticated
    USING (public.is_admin((SELECT auth.uid())));
