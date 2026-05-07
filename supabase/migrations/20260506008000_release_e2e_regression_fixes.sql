-- PR 14: release E2E close-out regression fixes.
--
-- The app-layer status mutation intentionally writes `status` only; the
-- sync_task_completion_flags BEFORE trigger derives `is_complete`. A
-- column-specific AFTER UPDATE OF is_complete trigger does not fire for that
-- status-only payload, so phase unlocks were skipped in the production path.
DROP TRIGGER IF EXISTS trigger_phase_unlock ON public.tasks;

CREATE TRIGGER trigger_phase_unlock
AFTER UPDATE OF status, is_complete ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.check_phase_unlock();

COMMENT ON TRIGGER trigger_phase_unlock ON public.tasks IS
  'Runs phase unlock checks for both explicit is_complete writes and the status-only app update path.';

-- RLS policies already constrain these operations. These grants let the
-- policies execute for authenticated callers instead of failing before RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.task_comments TO service_role;

GRANT SELECT ON TABLE public.notification_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_log TO service_role;
