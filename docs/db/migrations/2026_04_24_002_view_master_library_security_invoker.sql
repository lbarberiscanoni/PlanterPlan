-- Security hygiene follow-up
--
-- Supabase's database advisor flags SECURITY DEFINER views because they can
-- bypass caller RLS. Keep the master library view as a caller-RLS view; template
-- rows remain readable through the underlying tasks RLS policy.

ALTER VIEW public.view_master_library SET (security_invoker = true);
