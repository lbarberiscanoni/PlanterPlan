-- Trust caller-provided `root_id` in the BEFORE INSERT trigger.
--
-- Bug context: `clone_project_template` does a single bulk INSERT of an
-- entire template subtree, with each new row's `root_id` precomputed to the
-- new project root. The BEFORE INSERT trigger `set_root_id_from_parent`
-- previously *overwrote* NEW.root_id by looking up the parent's root_id in
-- public.tasks. Inside a bulk INSERT, sibling rows from the same statement
-- aren't visible yet — so when a milestone was processed before its parent
-- phase was committed, the lookup returned NULL and the fallback set
-- NEW.root_id := NEW.parent_task_id (the phase's id), not the project root.
-- The pattern was phase-by-phase: descendants of phases whose insertion
-- order happened to win the race kept the right root_id; descendants of the
-- losers all inherited the wrong root_id and disappeared from the UI's
-- `Task.filter({ root_id })` queries.
--
-- The fix: if the caller has already set NEW.root_id, trust it. All current
-- non-clone call sites (planter.entities.Task.create, the template builder
-- UI, default-project initialization) leave NEW.root_id NULL and continue
-- to rely on the trigger's lookup — they're unaffected.
--
-- This migration also backfills root_id for every existing row across all
-- projects so previously-broken clones become visible in the UI without
-- requiring a re-clone.

CREATE OR REPLACE FUNCTION public.set_root_id_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
DECLARE
    v_parent_root uuid;
BEGIN
    IF NEW.parent_task_id IS NULL THEN
        -- Root task: root_id = its own id.
        NEW.root_id := NEW.id;
        RETURN NEW;
    END IF;

    -- Caller-provided root_id wins. clone_project_template (and any future
    -- bulk-insert path) computes the correct value from a temp map the
    -- trigger can't see; clobbering it would re-introduce the missing-rows
    -- bug. Single-row callers leave NEW.root_id NULL and fall through to
    -- the legacy parent lookup below.
    IF NEW.root_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT root_id INTO v_parent_root FROM public.tasks WHERE id = NEW.parent_task_id;
    IF v_parent_root IS NULL THEN
        -- Parent might itself be a root whose row is being inserted in the
        -- same statement; fall back to the parent's id.
        SELECT id INTO v_parent_root FROM public.tasks WHERE id = NEW.parent_task_id;
    END IF;
    NEW.root_id := COALESCE(v_parent_root, NEW.parent_task_id);
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.set_root_id_from_parent() OWNER TO postgres;

COMMENT ON FUNCTION public.set_root_id_from_parent() IS
    'BEFORE INSERT on tasks: if caller supplied root_id, trust it. Otherwise derive from parent. Trusting caller fixes a bulk-clone bug where same-statement sibling rows were invisible to the trigger''s lookup. See migration 20260515000000_trust_caller_root_id.sql.';

-- One-shot backfill: recompute root_id for every existing row by walking
-- parent_task_id back to the true project root. Affects all projects and
-- all templates. handle_updated_at fires per row and will set updated_at
-- = now() on every fixed row — accepted as the price of repair. The Wave
-- 29 enforce_phase_lead_task_update_scope trigger bypasses for service-role
-- / postgres callers (lines 18–22 of 20260509000000_rbac_role_matrix_hardening.sql),
-- so this UPDATE is not rejected when run via `supabase db push`.

DO $$
DECLARE
    v_fixed_count int;
BEGIN
    WITH RECURSIVE project_tree AS (
        SELECT id, id AS true_root
        FROM public.tasks
        WHERE parent_task_id IS NULL

        UNION ALL

        SELECT t.id, pt.true_root
        FROM public.tasks t
        JOIN project_tree pt ON t.parent_task_id = pt.id
    ),
    fix AS (
        UPDATE public.tasks t
        SET root_id = pt.true_root
        FROM project_tree pt
        WHERE pt.id = t.id
          AND t.root_id IS DISTINCT FROM pt.true_root
        RETURNING t.id
    )
    SELECT count(*) INTO v_fixed_count FROM fix;

    RAISE NOTICE 'root_id backfill: corrected % rows', v_fixed_count;
END;
$$;
