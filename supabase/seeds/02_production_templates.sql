-- Seed Data: Production Templates
-- Populates "Launch Large" and "Multisite" templates with phases and premium flags.

DO $$
DECLARE
  v_launch_large_id uuid := gen_random_uuid();
  v_multisite_id uuid := gen_random_uuid();
  v_creator_id uuid; -- Potentially fetch a system user or use current user if running in context, but for seed we might need a fixed ID or leave null?
                     -- Ideally we fetch the first user or a system admin. For now, we'll try to find one or use a placeholder if allowed.
                     -- Safer to use NULL or a specific known UUID if possible. Let's use NULL for creator for templates.
  v_phase_id uuid;
  v_milestone_id uuid;
BEGIN

  -- 1. "Launch Large" Template
  INSERT INTO public.tasks (id, title, description, origin, status, is_premium, settings)
  VALUES (
    v_launch_large_id,
    'Launch Large',
    'Comprehensive 6-phase plan for launching a fully staffed church.',
    'template',
    'not_started',
    false,
    '{"published": true, "seed_key": "launch_large"}'::jsonb
  );

  -- Phase 1: Discovery (Free)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 1: Discovery', 'Assess calling and feasibility', v_launch_large_id, v_launch_large_id, 'template', 1, false)
  RETURNING id INTO v_phase_id;
    -- Milestone 1.1
    INSERT INTO public.tasks (title, parent_task_id, root_id, origin, position) VALUES ('Assessment', v_phase_id, v_launch_large_id, 'template', 1) RETURNING id INTO v_milestone_id;
      INSERT INTO public.tasks (title, parent_task_id, root_id, origin, position) VALUES ('Complete planter assessment', v_milestone_id, v_launch_large_id, 'template', 1);

  -- Phase 2: Planning (Free)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 2: Planning', 'Strategic development', v_launch_large_id, v_launch_large_id, 'template', 2, false);

  -- Phase 3: Preparation (Free)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 3: Preparation', 'Building systems and teams', v_launch_large_id, v_launch_large_id, 'template', 3, false);

  -- Phase 4: Pre-Launch (Premium)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 4: Pre-Launch', 'Marketing and preview services', v_launch_large_id, v_launch_large_id, 'template', 4, true);

  -- Phase 5: Launch (Premium)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 5: Launch', 'Grand Opening execution', v_launch_large_id, v_launch_large_id, 'template', 5, true);

  -- Phase 6: Growth (Premium)
  INSERT INTO public.tasks (title, description, parent_task_id, root_id, origin, position, is_premium)
  VALUES ('Phase 6: Growth', 'Post-launch sustainability', v_launch_large_id, v_launch_large_id, 'template', 6, true);


  -- 2. "Multisite Launch" Template (Fully Premium)
  INSERT INTO public.tasks (id, title, description, origin, status, is_premium, settings)
  VALUES (
    v_multisite_id,
    'Multisite Campus',
    'Streamlined process for launching a new campus of an existing church.',
    'template',
    'not_started',
    true,
    '{"published": true, "seed_key": "multisite"}'::jsonb
  );

  -- Phases for Multisite
  INSERT INTO public.tasks (title, parent_task_id, root_id, origin, position, is_premium)
  VALUES 
    ('Feasibility Study', v_multisite_id, v_multisite_id, 'template', 1, true),
    ('Campus Pastor Search', v_multisite_id, v_multisite_id, 'template', 2, true),
    ('Launch Team Recruitment', v_multisite_id, v_multisite_id, 'template', 3, true),
    ('Grand Opening', v_multisite_id, v_multisite_id, 'template', 4, true);

END $$;
