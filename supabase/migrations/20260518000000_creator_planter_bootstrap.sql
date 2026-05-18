-- Creator planter bootstrap.
--
-- Follow-up to 20260515000000_role_hierarchy_collapse. That migration tightened
-- project_members.role to CHECK (role IN ('planter','team')), but
-- public.initialize_default_project still tried to INSERT role = 'owner' as the
-- creator-bootstrap step. Result: every from-scratch project creation now fails
-- the CHECK constraint, the RPC aborts, planterClient.ts deletes the half-built
-- root task, and the user sees "Project initialization failed".
--
-- The clone path (public.clone_project_template) never bootstrapped a member
-- row at all — pre-collapse it worked because creator-owner RLS branches read
-- the tasks.creator column directly. Post-collapse the invite/list/remove
-- paths all require a Planter row in project_members, so clone-created
-- projects became unmanageable by their creators too.
--
-- Fix:
--   1. AFTER INSERT trigger on public.tasks → for every new instance-root task
--      (parent_task_id IS NULL AND origin = 'instance' AND creator IS NOT NULL),
--      upsert a 'planter' membership row for the creator. Covers both code
--      paths plus any future ones (raw inserts, edge functions, etc.).
--   2. CREATE OR REPLACE initialize_default_project with the bootstrap INSERT
--      removed — the trigger has already run by the time the RPC fires
--      (planterClient inserts the root, then calls the RPC), so the explicit
--      insert is redundant and was the line failing the CHECK constraint.
--   3. Backfill: insert a Planter row for every existing instance-root project
--      whose creator has no project_members row.

--------------------------------------------------------------------------------
-- 1. Trigger.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bootstrap_project_creator_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.parent_task_id IS NULL
       AND NEW.origin = 'instance'
       AND NEW.creator IS NOT NULL THEN
        INSERT INTO public.project_members (project_id, user_id, role)
        VALUES (NEW.id, NEW.creator, 'planter')
        ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bootstrap_project_creator_membership() IS
    'AFTER INSERT trigger on public.tasks. For every new instance root task, ensures the creator has a Planter row in project_members. Covers both initialize_default_project and clone_project_template paths after the role hierarchy collapse.';

DROP TRIGGER IF EXISTS trg_bootstrap_project_creator_membership ON public.tasks;

CREATE TRIGGER trg_bootstrap_project_creator_membership
    AFTER INSERT ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.bootstrap_project_creator_membership();

--------------------------------------------------------------------------------
-- 2. Remove the failing bootstrap INSERT from initialize_default_project.
--    Full body reproduced from 20260426000000_baseline_schema.sql lines
--    1253-1421 with lines 1267-1270 (the 'owner' bootstrap) deleted.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.initialize_default_project(p_project_id uuid, p_creator_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_phase_id uuid;
    v_milestone_id uuid;
    v_task_count int := 0;
BEGIN
    -- 0. PRE-FLIGHT: Security Check
    IF auth.uid() <> p_creator_id THEN
        RAISE EXCEPTION 'Access Denied: You can only create projects for yourself.';
    END IF;

    -- Creator membership bootstrap now lives in
    -- trg_bootstrap_project_creator_membership (AFTER INSERT on public.tasks).
    -- The root task is inserted by the client before this RPC runs, so the
    -- trigger has already created the Planter row.

    -- 1. Discovery Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 1, 'Discovery', 'Assess calling, gather resources, foundation', '{"color": "blue", "icon": "compass"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;

        -- Milestones for Discovery
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 1, 'Personal Assessment', 'Evaluate your calling and readiness', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Review and complete assessment', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Schedule planning meeting', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 2, 'Family Preparation', 'Prepare your family for the journey', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Family vision night', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Discuss expectations', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 3, 'Resource Gathering', 'Identify available resources and support', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'List potential partners', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Research planting grants', 'medium', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 3, 'Create budget draft', 'high', 'not_started', 'instance');
            v_task_count := v_task_count + 3;

    -- 2. Planning Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 2, 'Planning', 'Develop strategy, vision, and initial team', '{"color": "purple", "icon": "map"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;

        -- Milestones for Planning
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 1, 'Vision Development', 'Clarify your vision and mission', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Write vision statement', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Define core values', 'high', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 2, 'Strategic Planning', 'Develop your launch strategy', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Demographic study', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Define target audience', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status)
        VALUES (p_project_id, v_phase_id, p_creator_id, 3, 'Core Team Building', 'Recruit and develop your core team', 'instance', 'not_started')
        RETURNING id INTO v_milestone_id;
            INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
            (p_project_id, v_milestone_id, p_creator_id, 1, 'Host interest meetings', 'high', 'not_started', 'instance'),
            (p_project_id, v_milestone_id, p_creator_id, 2, 'Start small group', 'medium', 'not_started', 'instance');
            v_task_count := v_task_count + 2;

    -- 3. Preparation Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 3, 'Preparation', 'Build systems, recruit team, prepare for launch', '{"color": "orange", "icon": "wrench"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;

        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 1, 'Systems Setup', 'Establish operational systems', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Select ChMS', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Setup bank account', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 2, 'Facility Planning', 'Secure meeting location', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Visit potential venues', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Sign lease/agreement', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 3, 'Ministry Development', 'Develop key ministry areas', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Kids ministry strategy', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Worship team auditions', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

    -- 4. Pre-Launch Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 4, 'Pre-Launch', 'Final preparations, preview services, marketing', '{"color": "green", "icon": "rocket"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;

        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 1, 'Preview Services', 'Host preview gatherings', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Plan first preview service', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Debrief preview service', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 2, 'Marketing Launch', 'Begin community outreach', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Launch social media ads', 'medium', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Send mailers', 'medium', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 3, 'Final Preparations', 'Complete all launch requirements', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES
             (p_project_id, v_milestone_id, p_creator_id, 1, 'Order connection cards', 'high', 'not_started', 'instance'),
             (p_project_id, v_milestone_id, p_creator_id, 2, 'Finalize volunteer schedule', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 2;

    -- 5. Launch Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 5, 'Launch', 'Grand opening and initial growth phase', '{"color": "yellow", "icon": "zap"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 1, 'Launch Week', 'Execute your launch plan', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
             INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, priority, status, origin) VALUES (p_project_id, v_milestone_id, p_creator_id, 1, 'Launch Sunday!', 'high', 'not_started', 'instance');
             v_task_count := v_task_count + 1;

        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 2, 'First Month', 'Establish weekly rhythms', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 3, 'Guest Follow-up', 'Connect with visitors', 'instance', 'not_started') RETURNING id INTO v_milestone_id;

    -- 6. Growth Phase
    INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, settings, origin, status, is_premium)
    VALUES (p_project_id, p_project_id, p_creator_id, 6, 'Growth', 'Establish systems, develop leaders, expand reach', '{"color": "pink", "icon": "trending-up"}'::jsonb, 'instance', 'not_started', false)
    RETURNING id INTO v_phase_id;
        -- Milestones
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 1, 'Leadership Development', 'Train and empower leaders', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 2, 'Ministry Expansion', 'Launch additional ministries', 'instance', 'not_started') RETURNING id INTO v_milestone_id;
        INSERT INTO public.tasks (root_id, parent_task_id, creator, position, title, description, origin, status) VALUES
        (p_project_id, v_phase_id, p_creator_id, 3, 'Future Planning', 'Plan for multiplication', 'instance', 'not_started') RETURNING id INTO v_milestone_id;


    RETURN jsonb_build_object(
        'success', true,
        'project_id', p_project_id,
        'tasks_created', v_task_count
    );
END;
$$;

--------------------------------------------------------------------------------
-- 3. Backfill: every existing instance-root project whose creator has no
--    project_members row gets one. Idempotent.
--------------------------------------------------------------------------------

INSERT INTO public.project_members (project_id, user_id, role)
SELECT t.id, t.creator, 'planter'
FROM public.tasks t
WHERE t.parent_task_id IS NULL
  AND t.origin = 'instance'
  AND t.creator IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM public.project_members pm
      WHERE pm.project_id = t.id
        AND pm.user_id = t.creator
  )
ON CONFLICT (project_id, user_id) DO NOTHING;
