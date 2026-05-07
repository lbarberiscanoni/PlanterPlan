import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { installServiceWorkerMock, type MockServiceWorkerState } from '@/../Testing/test-utils/mocks/service-worker';
import { installNotificationMock, type NotificationMockState } from '@/../Testing/test-utils/mocks/notification-api';
import { makePushSubscription } from '@test';
import type { PushSubscriptionRow } from '@/shared/db/app.types';

const mockCreate = vi.fn();
const mockList = vi.fn();
const mockDelete = vi.fn();

vi.mock('@/shared/api/planterClient', () => ({
    planter: {
        entities: {
            PushSubscription: {
                create: (payload: unknown) => mockCreate(payload),
                list: () => mockList(),
                deleteByEndpoint: (endpoint: string) => mockDelete(endpoint),
            },
        },
    },
}));

const stableUser = { id: 'user-abc', email: 'user@test.local' };
const stableAuthContext = { user: stableUser };
vi.mock('@/shared/contexts/auth-context', () => ({
    // Stable references so the hook's `[isSupported, user]` effect dep doesn't re-fire every render.
    useAuth: () => stableAuthContext,
}));

// import.meta.env.VITE_VAPID_PUBLIC_KEY is stubbed via vitest's define config by
// setting the env var at test time.
vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'BOr1yE5OhkfjJ0PhT9O4jS4QbB0kfTw');

import { usePushSubscription } from '@/features/settings/hooks/usePushSubscription';

let sw: MockServiceWorkerState;
let notif: NotificationMockState;

beforeEach(() => {
    vi.clearAllMocks();
    sw = installServiceWorkerMock();
    notif = installNotificationMock('default');
    mockList.mockResolvedValue([]);
});

function wireSubscribeSuccess(endpoint = 'https://fcm.example/sub-1') {
    const fakePush = {
        endpoint,
        toJSON: () => ({
            endpoint,
            keys: { p256dh: 'p256-key', auth: 'auth-key' },
        }),
    };
    sw.pushManager.subscribe.mockResolvedValue(fakePush);
    return fakePush;
}

describe('usePushSubscription (Wave 30)', () => {
    it('reports isSupported=true when SW + PushManager are present', () => {
        const { result } = renderHook(() => usePushSubscription());
        expect(result.current.isSupported).toBe(true);
    });

    it('hydrates THIS browser\'s subscription by matching endpoint against the DB row set', async () => {
        const row = makePushSubscription({
            user_id: 'user-abc',
            endpoint: 'https://fcm.example/this-browser',
        });
        mockList.mockResolvedValue([row]);
        sw.pushManager.getSubscription.mockResolvedValue({
            endpoint: 'https://fcm.example/this-browser',
            unsubscribe: vi.fn(),
        });

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(result.current.subscription).toEqual(row));
    });

    it('stays null when the DB has a row but the browser is not subscribed', async () => {
        const row = makePushSubscription({
            user_id: 'user-abc',
            endpoint: 'https://fcm.example/other-device',
        });
        mockList.mockResolvedValue([row]);
        sw.pushManager.getSubscription.mockResolvedValue(null);

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(mockList).toHaveBeenCalled());
        expect(result.current.subscription).toBeNull();
    });

    it('subscribe: permission granted → registers SW + pushManager.subscribe + planterClient.create', async () => {
        notif.setPermission('default');
        notif.requestPermission.mockImplementation(async () => {
            notif.setPermission('granted');
            return 'granted' as NotificationPermission;
        });
        wireSubscribeSuccess();
        const created: PushSubscriptionRow = makePushSubscription({
            user_id: 'user-abc',
            endpoint: 'https://fcm.example/sub-1',
        });
        mockCreate.mockResolvedValue(created);

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(mockList).toHaveBeenCalled());

        await act(async () => {
            await result.current.subscribe();
        });

        expect(notif.requestPermission).toHaveBeenCalled();
        expect(sw.register).toHaveBeenCalledWith('/sw.js');
        expect(sw.pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            user_id: 'user-abc',
            endpoint: 'https://fcm.example/sub-1',
            p256dh: 'p256-key',
            auth: 'auth-key',
        }));
        await waitFor(() => expect(result.current.subscription).toEqual(created));
        expect(result.current.permissionState).toBe('granted');
    });

    it('subscribe: permission denied → no SW register + no planterClient.create', async () => {
        notif.requestPermission.mockImplementation(async () => {
            notif.setPermission('denied');
            return 'denied' as NotificationPermission;
        });

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(mockList).toHaveBeenCalled());

        await act(async () => {
            await result.current.subscribe();
        });

        expect(sw.register).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
        expect(result.current.permissionState).toBe('denied');
        expect(result.current.subscription).toBeNull();
    });

    it('subscribe: service worker registration failure is contained', async () => {
        notif.requestPermission.mockImplementation(async () => {
            notif.setPermission('granted');
            return 'granted' as NotificationPermission;
        });
        sw.register.mockRejectedValue(new Error('registration failed'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(mockList).toHaveBeenCalled());

        await act(async () => {
            await result.current.subscribe();
        });

        expect(sw.register).toHaveBeenCalledWith('/sw.js');
        expect(sw.pushManager.subscribe).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
        expect(result.current.subscription).toBeNull();
        expect(result.current.isSubscribing).toBe(false);
        expect(errSpy).toHaveBeenCalledWith('[usePushSubscription] subscribe failed', expect.any(Error));
        errSpy.mockRestore();
    });

    it('unsubscribe: calls DELETE + clears local state', async () => {
        const row = makePushSubscription({
            user_id: 'user-abc',
            endpoint: 'https://fcm.example/sub-existing',
        });
        mockList.mockResolvedValue([row]);
        // The hook hydrates by matching the browser endpoint to a DB row. Both
        // the hydration call and the unsubscribe call hit `getSubscription`, so
        // the stub must include the endpoint AND the unsubscribe method.
        const fakeExisting = {
            endpoint: 'https://fcm.example/sub-existing',
            unsubscribe: vi.fn().mockResolvedValue(true),
        };
        sw.pushManager.getSubscription.mockResolvedValue(fakeExisting);

        const { result } = renderHook(() => usePushSubscription());
        await waitFor(() => expect(result.current.subscription).toEqual(row));

        await act(async () => {
            await result.current.unsubscribe();
        });

        expect(fakeExisting.unsubscribe).toHaveBeenCalled();
        expect(mockDelete).toHaveBeenCalledWith('https://fcm.example/sub-existing');
        await waitFor(() => expect(result.current.subscription).toBeNull());
    });
});
