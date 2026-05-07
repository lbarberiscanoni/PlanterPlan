import { corsHeaders } from '../_shared/auth.ts';

interface ErrorLike {
  message?: string;
  code?: string;
}

interface InviteUser {
  id: string;
  email?: string | null;
}

interface InviteBody {
  projectId: string;
  email: string;
  role?: string;
}

interface UserClient {
  auth: {
    getUser: () => Promise<{
      data: { user: InviteUser | null };
      error: ErrorLike | null;
    }>;
  };
  rpc: <T = unknown>(
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: ErrorLike | null }>;
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          maybeSingle: () => Promise<{
            data: { role: string } | null;
            error: ErrorLike | null;
          }>;
        };
      };
    };
  };
}

interface AdminClient {
  auth: {
    admin: {
      inviteUserByEmail: (email: string) => Promise<{
        data: { user: InviteUser | null } | null;
        error: ErrorLike | null;
      }>;
    };
  };
  rpc: <T = unknown>(
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: ErrorLike | null }>;
  from: (table: string) => {
    upsert: (row: Record<string, unknown>) => Promise<{ error: ErrorLike | null }>;
  };
}

export type InviteByEmailCreateClient = (
  supabaseUrl: string,
  key: string,
  options?: { global?: { headers?: Record<string, string> } },
) => UserClient | AdminClient;

export interface InviteByEmailHandlerDeps {
  getEnv: (key: string) => string | undefined;
  createClient: InviteByEmailCreateClient;
  logger?: Pick<Console, 'error' | 'log'>;
}

const ASSIGNABLE_ROLES = new Set(['owner', 'editor', 'coach', 'viewer', 'limited']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jsonString(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function jsonError(error: string, status = 400): Response {
  return jsonString(JSON.stringify({ error }), status);
}

function jsonSuccess(user: { id: string; email: string }): Response {
  return jsonString(JSON.stringify({
    message: 'Invite processed successfully',
    user,
  }));
}

function parseBody(rawBody: unknown): Partial<InviteBody> {
  if (rawBody === null || typeof rawBody !== 'object' || Array.isArray(rawBody)) return {};
  return rawBody as Partial<InviteBody>;
}

function isExistingUserError(error: ErrorLike): boolean {
  return error.code === 'email_exists'
    || error.message?.includes('already been registered') === true;
}

function statusForMessage(message: string): number {
  if (message.startsWith('Unauthorized:')) return 401;
  if (message.startsWith('Forbidden:')) return 403;
  if (message.startsWith('Server configuration error')) return 500;
  return 400;
}

function clientSafeMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const safe =
    message.startsWith('Unauthorized:') ||
    message.startsWith('Forbidden:') ||
    message.startsWith('Invalid ') ||
    message.startsWith('Missing ') ||
    message.startsWith('Server configuration error');
  return safe ? message : 'Invite failed';
}

function logSafeError(
  logger: Pick<Console, 'error'>,
  label: string,
  error: ErrorLike | null,
): void {
  logger.error(label, { code: error?.code ?? 'unknown' });
}

export async function handleInviteByEmailRequest(
  req: Request,
  deps: InviteByEmailHandlerDeps,
): Promise<Response> {
  const logger = deps.logger ?? console;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonError('Method Not Allowed', 405);
  }

  try {
    const supabaseUrl = deps.getEnv('SUPABASE_URL');
    const supabaseAnonKey = deps.getEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = deps.getEnv('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      throw new Error('Server configuration error');
    }

    const body = parseBody(await req.json().catch(() => ({})));
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = typeof body.role === 'string' && body.role.length > 0 ? body.role : 'viewer';

    if (!projectId) throw new Error('Missing projectId');
    if (!email) throw new Error('Missing email');
    if (!EMAIL_PATTERN.test(email)) throw new Error('Invalid email');
    if (!ASSIGNABLE_ROLES.has(role)) throw new Error('Invalid role');

    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new Error('Unauthorized: missing session');

    const userClient = deps.createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authorization } },
    }) as UserClient;

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized: invalid session');

    const { data: isAdmin, error: adminError } = await userClient.rpc<boolean>('is_admin', {
      p_user_id: user.id,
    });
    if (adminError) throw new Error('Invite failed');

    if (!isAdmin) {
      const { data: memberData, error: memberError } = await userClient
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberError || memberData?.role !== 'owner') {
        throw new Error('Forbidden: only project owners can invite users.');
      }
    }

    const adminClient = deps.createClient(supabaseUrl, serviceRoleKey) as AdminClient;
    let targetUserId: string | null = null;

    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email);

    if (inviteError) {
      if (!isExistingUserError(inviteError)) {
        logSafeError(logger, 'Supabase invite error:', inviteError);
        throw new Error('Invite failed');
      }

      logger.log?.('User exists, looking up ID via get_user_id_by_email...');
      const { data: existingUserId, error: lookupError } = await adminClient.rpc<string>(
        'get_user_id_by_email',
        { email },
      );

      if (lookupError || !existingUserId) {
        logSafeError(logger, 'User lookup failed:', lookupError);
        throw new Error('Invite failed');
      }

      targetUserId = existingUserId;
    } else {
      targetUserId = inviteData?.user?.id ?? null;
    }

    if (!targetUserId) throw new Error('Invite failed');

    const { error: insertError } = await adminClient.from('project_members').upsert({
      project_id: projectId,
      user_id: targetUserId,
      role,
    });

    if (insertError) {
      logSafeError(logger, 'Member insert error:', insertError);
      throw new Error('Invite failed');
    }

    return jsonSuccess({ id: targetUserId, email });
  } catch (error) {
    const message = clientSafeMessage(error);
    logger.error('Edge Function Exception:', { message });
    return jsonError(message, statusForMessage(message));
  }
}
