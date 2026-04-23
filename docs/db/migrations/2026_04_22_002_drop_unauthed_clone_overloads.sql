-- Post-megabatch security hardening — drop unauthed clone overloads
--
-- Security audit found three coexisting overloads of
-- `public.clone_project_template`:
--
--   1. 4-param: (uuid, uuid, text, uuid) — schema.sql:257. SECURITY DEFINER,
--      NO auth check, accepts p_user_id as attacker-controllable creator.
--      Client callers never pass the 4-param shape; safe to drop.
--
--   2. 8-param date: (..., date, date) — schema.sql:363. SECURITY DEFINER,
--      NO auth check. PostgREST MAY bind to this when the caller sends
--      plain ISO dates. Wave 36 added `cloned_from_task_id` stamping here
--      but never added the `has_permission` gate.
--
--   3. 8-param timestamptz: (..., timestamptz, timestamptz) — schema.sql:475.
--      SECURITY DEFINER, correct `has_permission` check. This is the
--      overload the app reliably invokes.
--
-- Both #1 and #2 let any authenticated user clone any template subtree
-- into any project by calling the RPC with a stolen template UUID. Drop
-- them so PostgREST can only dispatch to the hardened overload.

DROP FUNCTION IF EXISTS public.clone_project_template(
    uuid,  -- p_template_id
    uuid,  -- p_new_parent_id
    text,  -- p_new_origin
    uuid   -- p_user_id
);

DROP FUNCTION IF EXISTS public.clone_project_template(
    uuid,  -- p_template_id
    uuid,  -- p_new_parent_id
    text,  -- p_new_origin
    uuid,  -- p_user_id
    text,  -- p_title
    text,  -- p_description
    date,  -- p_start_date
    date   -- p_due_date
);

-- The timestamptz overload remains in place. It carries the
-- `has_permission(v_template_root_id, auth.uid(), 'member')` gate plus
-- the Wave 36 `cloned_from_task_id` stamp (patched in
-- 2026_04_18_clone_rpc_wave36_patch.sql).
