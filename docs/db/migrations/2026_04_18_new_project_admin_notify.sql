-- Wave 34 Task 3 — Admin notifications on new project creation
--
-- Closes the `docs/architecture/dashboard-analytics.md` "Admin Notifications"
-- known gap deferred from Wave 30. Every INSERT on `public.tasks` that is a
-- project root (parent_task_id IS NULL AND origin = 'instance') enqueues a
-- `notification_log` row per admin with event_type = 'admin_new_project_pending'.
-- The Wave 30 `dispatch-notifications` cron picks these up and dispatches
-- through the normal per-admin email/push pipeline (admins can opt out via
-- Settings → Notifications).
--
-- Additive only. No existing trigger or column is modified.

CREATE OR REPLACE FUNCTION public.notify_admin_on_new_project()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_admin record;
    v_actor_id uuid := NEW.creator;
    v_payload jsonb;
BEGIN
    -- Scope: instance projects only (templates don't fire admin notifications).
    IF NEW.parent_task_id IS NOT NULL OR NEW.origin <> 'instance' THEN
        RETURN NEW;
    END IF;

    v_payload := jsonb_build_object(
        'project_id', NEW.id,
        'project_title', NEW.title,
        'actor_id', v_actor_id
    );

    FOR v_admin IN SELECT user_id FROM public.admin_users LOOP
        -- Don't notify the admin who created the project.
        IF v_actor_id IS NOT NULL AND v_admin.user_id = v_actor_id THEN
            CONTINUE;
        END IF;

        INSERT INTO public.notification_log (
            user_id,
            channel,
            event_type,
            payload
        )
        VALUES (
            v_admin.user_id,
            'email',
            'admin_new_project_pending',
            v_payload
        );
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_on_new_project ON public.tasks;
CREATE TRIGGER trg_notify_admin_on_new_project
    AFTER INSERT ON public.tasks
    FOR EACH ROW
    WHEN (NEW.parent_task_id IS NULL AND NEW.origin = 'instance')
    EXECUTE FUNCTION public.notify_admin_on_new_project();

REVOKE ALL ON FUNCTION public.notify_admin_on_new_project() FROM PUBLIC;
