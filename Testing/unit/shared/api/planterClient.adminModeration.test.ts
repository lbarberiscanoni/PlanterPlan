import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRpc = vi.fn();
const mockInvoke = vi.fn();

vi.mock('@/shared/db/client', () => ({
    supabase: {
        rpc: (...args: unknown[]) => mockRpc(...args),
        functions: {
            invoke: (...args: unknown[]) => mockInvoke(...args),
        },
        auth: {
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
            getUser: vi.fn(),
            signOut: vi.fn(),
            updateUser: vi.fn(),
        },
        from: vi.fn(),
    },
}));

vi.mock('@/shared/lib/retry', () => ({
    retry: (fn: () => unknown) => fn(),
}));

import { planter, PlanterError } from '@/shared/api/planterClient';

describe('planter.admin moderation wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRpc.mockResolvedValue({ data: null, error: null });
        mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    });

    it('toggles admin role through the SECURITY DEFINER RPC', async () => {
        await planter.admin.setAdminRole('target-user', true);

        expect(mockRpc).toHaveBeenCalledWith('admin_set_user_admin_role', {
            p_target_uid: 'target-user',
            p_make_admin: true,
        });
    });

    it('bubbles admin role RPC authorization failures', async () => {
        mockRpc.mockResolvedValue({
            data: null,
            error: new PlanterError('unauthorized: admin role required', 'P0001'),
        });

        await expect(planter.admin.setAdminRole('target-user', true)).rejects.toMatchObject({
            message: 'unauthorized: admin role required',
        });
    });

    it('suspends users through the admin-user-moderation edge function', async () => {
        await planter.admin.suspendUser('target-user', 24);

        expect(mockInvoke).toHaveBeenCalledWith('admin-user-moderation', {
            body: {
                duration_hours: 24,
                action: 'suspend',
                target_uid: 'target-user',
            },
        });
    });

    it('unsuspends users through the admin-user-moderation edge function', async () => {
        await planter.admin.unsuspendUser('target-user');

        expect(mockInvoke).toHaveBeenCalledWith('admin-user-moderation', {
            body: {
                action: 'unsuspend',
                target_uid: 'target-user',
            },
        });
    });

    it('surfaces edge function product errors without broadening permissions', async () => {
        mockInvoke.mockResolvedValue({
            data: { success: false, error: 'unauthorized: admin role required' },
            error: null,
        });

        await expect(planter.admin.suspendUser('target-user')).rejects.toMatchObject({
            name: 'PlanterError',
            message: 'unauthorized: admin role required',
            status: 400,
        });
    });

    it('returns password reset links from the moderation edge function', async () => {
        mockInvoke.mockResolvedValue({
            data: { success: true, reset_link: 'https://auth.example/reset-token' },
            error: null,
        });

        await expect(planter.admin.generatePasswordResetLink('target-user')).resolves.toBe(
            'https://auth.example/reset-token',
        );
        expect(mockInvoke).toHaveBeenCalledWith('admin-user-moderation', {
            body: {
                action: 'reset_password',
                target_uid: 'target-user',
            },
        });
    });

    it('fails closed when reset-link generation returns success without a link', async () => {
        mockInvoke.mockResolvedValue({
            data: { success: true },
            error: null,
        });

        await expect(planter.admin.generatePasswordResetLink('target-user')).rejects.toMatchObject({
            name: 'PlanterError',
            message: 'Reset link missing from moderation response',
            status: 500,
        });
    });
});
