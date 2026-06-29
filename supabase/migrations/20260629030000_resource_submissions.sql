-- Resource submission + approval workflow (Patrick/Tim 2026-06, Batch C).
--
-- Until now the master resource catalog was admin-create only. This lets any
-- authenticated user SUBMIT a resource, which lands as `pending` and is hidden
-- from the catalog/pickers until an admin approves it. Approve = set status
-- 'approved'; reject = delete the row (admin DELETE policy already exists).

ALTER TABLE public.resources
    ADD COLUMN status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending', 'approved'));

-- Existing rows are all admin-curated, so the 'approved' default backfills them
-- correctly. New admin inserts also default to 'approved'.

-- Small partial index for the admin review queue.
CREATE INDEX IF NOT EXISTS resources_pending_idx
    ON public.resources (created_at DESC)
    WHERE status = 'pending';

-- Non-admins may submit a resource, but only as their OWN pending row — they
-- cannot self-approve (status is pinned to 'pending') or attribute it to
-- someone else. Admin inserts continue through `resources_admin_insert`.
CREATE POLICY resources_member_submit ON public.resources
    FOR INSERT TO authenticated
    WITH CHECK (
        created_by = (SELECT auth.uid())
        AND status = 'pending'
    );

-- Tighten SELECT: everyone sees approved resources; admins and the original
-- submitter also see pending ones (so a submitter can see "awaiting review"
-- and admins can run the queue). Replaces the prior USING (true) policy.
DROP POLICY IF EXISTS resources_select_authenticated ON public.resources;
CREATE POLICY resources_select_authenticated ON public.resources
    FOR SELECT TO authenticated
    USING (
        status = 'approved'
        OR public.is_admin((SELECT auth.uid()))
        OR created_by = (SELECT auth.uid())
    );
