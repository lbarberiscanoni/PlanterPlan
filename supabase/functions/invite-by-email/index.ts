import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { corsHeaders } from '../_shared/auth.ts';

serve(async (req) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Parse Request
    const body = await req.json().catch(() => ({}));
    const { projectId, email, role } = body;

    // ... (Validation skipped for brevity in tool call, inferred context assumes it's consistent)

    // ... (Clients init skipped)

    // (Assuming context matches, targeting the logic flow)
    // Redefining context for robust replace

    // ... [Inside Try Block] ...

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Server configuration error: Missing Environment Variables');
    }

    // 3. Authenticate User (Authorize-Then-Escalate)
    const { data: { user }, error: userError } = await createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    }).auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized: Invalid session');
    }

    // Initialize Anon Client with Auth Header for RLS checks
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    // 4. Verify Project Permissions
    const { data: memberData, error: memberError } = await supabaseClient
      .from('project_members')
      .select('role')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (memberError || !memberData) {
      throw new Error('Access Denied: You are not a member of this project.');
    }

    const allowedRoles = ['owner', 'editor'];
    if (!allowedRoles.includes(memberData.role)) {
      throw new Error('Forbidden: Insufficient permissions to invite users.');
    }

    // Security hardening: mirror the privilege-escalation gate in the SQL
    // `invite_user_to_project` RPC. Without this, an editor could POST
    // {role: 'owner'} and self-promote — the `allowedRoles` check above only
    // verifies the caller CAN invite, not what role they can assign.
    const ASSIGNABLE_ROLES = ['owner', 'editor', 'coach', 'viewer', 'limited'];
    if (role && !ASSIGNABLE_ROLES.includes(role)) {
      throw new Error('Forbidden: invalid role.');
    }
    if (memberData.role === 'editor' && role === 'owner') {
      throw new Error('Forbidden: editors cannot assign the Owner role.');
    }

    // 5. Initialize Admin Client (Only after auth check passes)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 6. Lookup User by Email and Insert (Admin Only)
    let targetUserId;

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      // Handle "User already registered" case
      if (
        inviteError.code === 'email_exists' ||
        inviteError.message?.includes('already been registered')
      ) {
        console.log('User exists, looking up ID via RPC...');

        // Use RPC to look up user ID safely (requires get_user_id_by_email migration)
        const { data: existingUserId, error: lookupError } = await supabaseAdmin.rpc(
          'get_user_id_by_email',
          { email }
        );

        if (lookupError || !existingUserId) {
          console.error('User lookup failed:', lookupError);
          throw new Error(
            'User already registered but ID lookup failed (Check get_user_id_by_email RPC).'
          );
        }
        targetUserId = existingUserId as string;
      } else {
        console.error('Supabase Invite Error:', inviteError);
        throw inviteError;
      }
    } else if (inviteData && inviteData.user) {
      targetUserId = inviteData.user.id;
    } else {
      throw new Error('Failed to resolve user from invite.');
    }

    // Security hardening: block an editor from demoting / overwriting an
    // existing owner via upsert. Mirror the SQL RPC's behavior.
    if (memberData.role === 'editor') {
      const { data: existingRow } = await supabaseAdmin
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', targetUserId)
        .maybeSingle();
      if (existingRow && existingRow.role === 'owner') {
        throw new Error('Forbidden: editors cannot modify an existing Owner.');
      }
    }

    // 7. Insert into Project Members
    const { error: insertError } = await supabaseAdmin.from('project_members').upsert({
      project_id: projectId,
      user_id: targetUserId,
      role: role || 'viewer',
    });

    if (insertError) {
      console.error('Member Insert Error:', insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        message: 'Invite processed successfully',
        user: { id: targetUserId, email },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    // Log the full detail server-side for debugging; return a sanitized
    // client-facing message. Preserve the specific "Forbidden" / "Access
    // Denied" / "Invalid input" branches because those are the product-
    // meaningful errors the UI expects. Everything else collapses to a
    // generic "Invite failed" so upstream provider exceptions (Supabase
    // admin API internal paths) don't leak to the browser.
    console.error('Edge Function Exception:', error);
    const message: string = error?.message ?? '';
    const isServerError = message.includes('Server configuration error');
    const isProductError =
      message.startsWith('Forbidden:') ||
      message.startsWith('Access Denied:') ||
      message.startsWith('Missing') ||
      message.startsWith('Invalid');
    const clientMessage = isProductError ? message : 'Invite failed';
    return new Response(JSON.stringify({ error: clientMessage }), {
      status: isServerError ? 500 : 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
