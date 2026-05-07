import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  handleInviteByEmailRequest,
  type InviteByEmailCreateClient,
} from './handler.ts';

serve((req) =>
  handleInviteByEmailRequest(req, {
    getEnv: (key) => Deno.env.get(key),
    createClient: createClient as InviteByEmailCreateClient,
    logger: console,
  }),
);
