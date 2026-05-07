import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleInviteByEmailRequest,
    type InviteByEmailCreateClient,
} from '@/../supabase/functions/invite-by-email/handler';

const SUPABASE_URL = 'https://planterplan.test';
const ANON_KEY = 'anon-key';
const SERVICE_ROLE_KEY = 'service-role-key-never-returned';

interface ErrorLike {
    message?: string;
    code?: string;
}

interface HarnessOptions {
    callerId?: string;
    callerRole?: string | null;
    isAdmin?: boolean;
    inviteError?: ErrorLike | null;
    inviteUserId?: string | null;
    lookupUserId?: string | null;
    upsertError?: ErrorLike | null;
}

function request(body: Record<string, unknown>, auth = 'Bearer user-jwt') {
    return new Request('https://planterplan.test/functions/v1/invite-by-email', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

async function responseJson<T extends Record<string, unknown>>(response: Response): Promise<T> {
    return JSON.parse(await response.text()) as T;
}

function makeHarness(options: HarnessOptions = {}) {
    const callerId = options.callerId ?? 'owner-user';
    const callerRole = options.callerRole === undefined ? 'owner' : options.callerRole;
    const upsertRows: Record<string, unknown>[] = [];

    const getUser = vi.fn().mockResolvedValue({
        data: { user: { id: callerId, email: `${callerId}@example.com` } },
        error: null,
    });
    const userRpc = vi.fn().mockResolvedValue({
        data: options.isAdmin ?? false,
        error: null,
    });
    const maybeSingle = vi.fn().mockResolvedValue({
        data: callerRole ? { role: callerRole } : null,
        error: null,
    });
    const secondEq = vi.fn(() => ({ maybeSingle }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const userSelect = vi.fn(() => ({ eq: firstEq }));
    const userFrom = vi.fn((table: string) => {
        expect(table).toBe('project_members');
        return { select: userSelect };
    });

    const inviteUserByEmail = vi.fn().mockResolvedValue(
        options.inviteError
            ? { data: null, error: options.inviteError }
            : {
                data: {
                    user: {
                        id: options.inviteUserId === undefined ? 'invited-user' : options.inviteUserId,
                        email: 'target@example.com',
                    },
                },
                error: null,
            },
    );
    const adminRpc = vi.fn().mockResolvedValue({
        data: options.lookupUserId ?? 'existing-user',
        error: null,
    });
    const upsert = vi.fn((row: Record<string, unknown>) => {
        upsertRows.push(row);
        return Promise.resolve({ error: options.upsertError ?? null });
    });
    const adminFrom = vi.fn((table: string) => {
        expect(table).toBe('project_members');
        return { upsert };
    });

    const userClient = {
        auth: { getUser },
        rpc: userRpc,
        from: userFrom,
    };
    const adminClient = {
        auth: { admin: { inviteUserByEmail } },
        rpc: adminRpc,
        from: adminFrom,
    };

    const createClient = vi.fn<InviteByEmailCreateClient>((_url, key) => {
        if (key === ANON_KEY) return userClient;
        if (key === SERVICE_ROLE_KEY) return adminClient;
        throw new Error(`Unexpected Supabase key: ${key}`);
    });
    const logger = { error: vi.fn(), log: vi.fn() };

    return {
        deps: {
            getEnv: (key: string) => ({
                SUPABASE_URL,
                SUPABASE_ANON_KEY: ANON_KEY,
                SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
            })[key],
            createClient,
            logger,
        },
        createClient,
        getUser,
        userRpc,
        userFrom,
        inviteUserByEmail,
        adminRpc,
        upsert,
        upsertRows,
        logger,
    };
}

describe('invite-by-email handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lets project owners invite users and upserts membership after authorization', async () => {
        const harness = makeHarness({ callerRole: 'owner', inviteUserId: 'new-user' });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'TARGET@example.com', role: 'viewer' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({
            message: 'Invite processed successfully',
            user: { id: 'new-user', email: 'TARGET@example.com' },
        });
        expect(harness.userRpc).toHaveBeenCalledWith('is_admin', { p_user_id: 'owner-user' });
        expect(harness.inviteUserByEmail).toHaveBeenCalledWith('TARGET@example.com');
        expect(harness.upsertRows[0]).toEqual({
            project_id: 'project-1',
            user_id: 'new-user',
            role: 'viewer',
        });
    });

    it('denies editor invites before service-role operations are created', async () => {
        const harness = makeHarness({ callerId: 'editor-user', callerRole: 'editor' });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'target@example.com', role: 'viewer' }),
            harness.deps,
        );
        const bodyText = await response.text();

        expect(response.status).toBe(403);
        expect(JSON.parse(bodyText)).toEqual({
            error: 'Forbidden: only project owners can invite users.',
        });
        expect(harness.createClient).toHaveBeenCalledTimes(1);
        expect(harness.inviteUserByEmail).not.toHaveBeenCalled();
        expect(harness.upsert).not.toHaveBeenCalled();
        expect(bodyText).not.toContain(SERVICE_ROLE_KEY);
    });

    it('denies viewer invites before service-role operations are created', async () => {
        const harness = makeHarness({ callerId: 'viewer-user', callerRole: 'viewer' });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'target@example.com', role: 'viewer' }),
            harness.deps,
        );

        expect(response.status).toBe(403);
        await expect(responseJson(response)).resolves.toEqual({
            error: 'Forbidden: only project owners can invite users.',
        });
        expect(harness.createClient).toHaveBeenCalledTimes(1);
        expect(harness.inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects malformed email addresses before service-role operations are created', async () => {
        const harness = makeHarness({ callerRole: 'owner' });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'not-an-email', role: 'viewer' }),
            harness.deps,
        );

        expect(response.status).toBe(400);
        await expect(responseJson(response)).resolves.toEqual({ error: 'Invalid email' });
        expect(harness.createClient).not.toHaveBeenCalled();
        expect(harness.inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('lets platform admins invite without project membership', async () => {
        const harness = makeHarness({
            callerId: 'platform-admin',
            callerRole: null,
            isAdmin: true,
            inviteUserId: 'admin-invited-user',
        });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'target@example.com', role: 'limited' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toMatchObject({
            user: { id: 'admin-invited-user' },
        });
        expect(harness.userFrom).not.toHaveBeenCalled();
        expect(harness.upsertRows[0]).toMatchObject({
            user_id: 'admin-invited-user',
            role: 'limited',
        });
    });

    it('adds already-registered users through the lookup RPC', async () => {
        const harness = makeHarness({
            inviteError: { code: 'email_exists', message: 'A user with this email address has already been registered' },
            lookupUserId: 'existing-user',
        });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'existing@example.com', role: 'coach' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        expect(harness.adminRpc).toHaveBeenCalledWith('get_user_id_by_email', {
            email: 'existing@example.com',
        });
        expect(harness.upsertRows[0]).toMatchObject({
            project_id: 'project-1',
            user_id: 'existing-user',
            role: 'coach',
        });
    });

    it('preserves trimmed email casing for existing-user lookup fallback', async () => {
        const harness = makeHarness({
            inviteError: { code: 'email_exists', message: 'A user with this email address has already been registered' },
            lookupUserId: 'mixed-case-user',
        });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: ' MixedCase@Example.com ', role: 'viewer' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        expect(harness.inviteUserByEmail).toHaveBeenCalledWith('MixedCase@Example.com');
        expect(harness.adminRpc).toHaveBeenCalledWith('get_user_id_by_email', {
            email: 'MixedCase@Example.com',
        });
        expect(harness.upsertRows[0]).toMatchObject({
            user_id: 'mixed-case-user',
            role: 'viewer',
        });
    });

    it('sanitizes provider failures in client responses and server logs', async () => {
        const harness = makeHarness({
            inviteError: {
                code: 'smtp_failed',
                message: `provider leaked ${SERVICE_ROLE_KEY}`,
            },
        });

        const response = await handleInviteByEmailRequest(
            request({ projectId: 'project-1', email: 'target@example.com', role: 'viewer' }),
            harness.deps,
        );
        const bodyText = await response.text();
        const logText = JSON.stringify(harness.logger.error.mock.calls);

        expect(response.status).toBe(400);
        expect(JSON.parse(bodyText)).toEqual({ error: 'Invite failed' });
        expect(bodyText).not.toContain(SERVICE_ROLE_KEY);
        expect(logText).not.toContain(SERVICE_ROLE_KEY);
    });
});
