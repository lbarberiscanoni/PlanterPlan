import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    handleAdminUserModerationRequest,
    type AdminModerationCreateClient,
} from '@/../supabase/functions/admin-user-moderation/handler';

const SUPABASE_URL = 'https://planterplan.test';
const ANON_KEY = 'anon-key';
const SERVICE_ROLE_KEY = 'service-role-key-never-returned';

interface HarnessOptions {
    callerId?: string;
    callerEmail?: string;
    isAdmin?: boolean;
    targetEmail?: string | null;
}

function request(body: Record<string, unknown>, auth = 'Bearer user-jwt') {
    return new Request('https://planterplan.test/functions/v1/admin-user-moderation', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

function rawBodyRequest(body: string, auth = 'Bearer user-jwt') {
    return new Request('https://planterplan.test/functions/v1/admin-user-moderation', {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body,
    });
}

async function responseJson<T extends Record<string, unknown>>(response: Response): Promise<T> {
    return JSON.parse(await response.text()) as T;
}

function makeHarness(options: HarnessOptions = {}) {
    const callerId = options.callerId ?? 'admin-user';
    const callerEmail = options.callerEmail ?? 'admin@example.com';
    const targetEmail = options.targetEmail === undefined ? 'target@example.com' : options.targetEmail;
    const insertedAuditRows: Record<string, unknown>[] = [];

    const getUser = vi.fn().mockResolvedValue({
        data: { user: { id: callerId, email: callerEmail } },
        error: null,
    });
    const rpc = vi.fn().mockResolvedValue({ data: options.isAdmin ?? true, error: null });
    const getUserById = vi.fn().mockResolvedValue({
        data: targetEmail === null ? { user: { id: 'target-user', email: null } } : {
            user: { id: 'target-user', email: targetEmail },
        },
        error: null,
    });
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    const generateLink = vi.fn().mockResolvedValue({
        data: { properties: { action_link: 'https://auth.example/reset-token' } },
        error: null,
    });
    const insert = vi.fn((row: Record<string, unknown>) => {
        insertedAuditRows.push(row);
        return Promise.resolve({ error: null });
    });

    const userClient = { auth: { getUser } };
    const adminClient = {
        auth: { admin: { getUserById, updateUserById, generateLink } },
        rpc,
        from: vi.fn((table: string) => {
            expect(table).toBe('activity_log');
            return { insert };
        }),
    };

    const createClient = vi.fn<AdminModerationCreateClient>((_url, key) => {
        if (key === ANON_KEY) return userClient;
        if (key === SERVICE_ROLE_KEY) return adminClient;
        throw new Error(`Unexpected Supabase key: ${key}`);
    });

    return {
        deps: {
            getEnv: (key: string) => ({
                SUPABASE_URL,
                SUPABASE_ANON_KEY: ANON_KEY,
                SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
            })[key],
            createClient,
            logger: { error: vi.fn() },
        },
        createClient,
        getUser,
        rpc,
        getUserById,
        updateUserById,
        generateLink,
        insert,
        insertedAuditRows,
    };
}

describe('admin-user-moderation handler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('denies direct invocation by authenticated non-admin users', async () => {
        const harness = makeHarness({ callerId: 'standard-user', isAdmin: false });

        const response = await handleAdminUserModerationRequest(
            request({ action: 'suspend', target_uid: 'target-user' }),
            harness.deps,
        );
        const bodyText = await response.text();

        expect(response.status).toBe(200);
        expect(JSON.parse(bodyText)).toEqual({
            success: false,
            error: 'unauthorized: admin role required',
        });
        expect(harness.rpc).toHaveBeenCalledWith('is_admin', { p_user_id: 'standard-user' });
        expect(harness.getUserById).not.toHaveBeenCalled();
        expect(harness.updateUserById).not.toHaveBeenCalled();
        expect(harness.generateLink).not.toHaveBeenCalled();
        expect(bodyText).not.toContain(SERVICE_ROLE_KEY);
    });

    it('lets an admin suspend a target user and writes an audit row', async () => {
        const harness = makeHarness();

        const response = await handleAdminUserModerationRequest(
            request({ action: 'suspend', target_uid: 'target-user' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({ success: true });
        expect(harness.updateUserById).toHaveBeenCalledWith('target-user', {
            ban_duration: '876000h',
        });
        expect(harness.insertedAuditRows[0]).toMatchObject({
            actor_id: 'admin-user',
            entity_id: 'target-user',
            action: 'user_suspended',
            payload: { target_email: 'target@example.com', duration: '876000h' },
        });
    });

    it('rounds positive fractional suspension durations up to at least one hour', async () => {
        const harness = makeHarness();

        const response = await handleAdminUserModerationRequest(
            request({ action: 'suspend', target_uid: 'target-user', duration_hours: 0.5 }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({ success: true });
        expect(harness.updateUserById).toHaveBeenCalledWith('target-user', {
            ban_duration: '1h',
        });
        expect(harness.insertedAuditRows[0]).toMatchObject({
            action: 'user_suspended',
            payload: { duration: '1h' },
        });
    });

    it('lets an admin unsuspend a target user and writes an audit row', async () => {
        const harness = makeHarness();

        const response = await handleAdminUserModerationRequest(
            request({ action: 'unsuspend', target_uid: 'target-user' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({ success: true });
        expect(harness.updateUserById).toHaveBeenCalledWith('target-user', {
            ban_duration: 'none',
        });
        expect(harness.insertedAuditRows[0]).toMatchObject({
            action: 'user_unsuspended',
            payload: { target_email: 'target@example.com' },
        });
    });

    it('lets an admin generate a password reset link without logging the credential-like URL', async () => {
        const harness = makeHarness();

        const response = await handleAdminUserModerationRequest(
            request({ action: 'reset_password', target_uid: 'target-user' }),
            harness.deps,
        );
        const bodyText = await response.text();

        expect(response.status).toBe(200);
        expect(JSON.parse(bodyText)).toEqual({
            success: true,
            reset_link: 'https://auth.example/reset-token',
        });
        expect(harness.generateLink).toHaveBeenCalledWith({
            type: 'recovery',
            email: 'target@example.com',
        });
        expect(harness.insertedAuditRows[0]).toMatchObject({
            action: 'password_reset_requested',
            payload: { target_email: 'target@example.com' },
        });
        expect(JSON.stringify(harness.insertedAuditRows[0])).not.toContain('reset-token');
        expect(bodyText).not.toContain(SERVICE_ROLE_KEY);
    });

    it('blocks self-suspension before calling auth.admin APIs', async () => {
        const harness = makeHarness({ callerId: 'target-user' });

        const response = await handleAdminUserModerationRequest(
            request({ action: 'suspend', target_uid: 'target-user' }),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({
            success: false,
            error: 'self_moderation_forbidden',
        });
        expect(harness.getUserById).not.toHaveBeenCalled();
        expect(harness.updateUserById).not.toHaveBeenCalled();
        expect(harness.insert).not.toHaveBeenCalled();
    });

    it('returns HTTP 401 when no caller JWT is provided', async () => {
        const harness = makeHarness();
        const response = await handleAdminUserModerationRequest(
            new Request('https://planterplan.test/functions/v1/admin-user-moderation', {
                method: 'POST',
                body: JSON.stringify({ action: 'suspend', target_uid: 'target-user' }),
            }),
            harness.deps,
        );

        expect(response.status).toBe(401);
        await expect(responseJson(response)).resolves.toEqual({
            success: false,
            error: 'Authorization required',
        });
        expect(harness.createClient).not.toHaveBeenCalled();
    });

    it('treats literal null JSON bodies as invalid payloads instead of throwing', async () => {
        const harness = makeHarness();
        const response = await handleAdminUserModerationRequest(
            rawBodyRequest('null'),
            harness.deps,
        );

        expect(response.status).toBe(200);
        await expect(responseJson(response)).resolves.toEqual({
            success: false,
            error: 'Invalid action',
        });
        expect(harness.createClient).not.toHaveBeenCalled();
    });
});
