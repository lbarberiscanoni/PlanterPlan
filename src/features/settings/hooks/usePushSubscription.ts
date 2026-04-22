import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/shared/contexts/AuthContext';
import { planter } from '@/shared/api/planterClient';
import type { PushSubscriptionRow } from '@/shared/db/app.types';

/** Base64-URL → Uint8Array for `applicationServerKey`. Standard MDN snippet. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalised);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
}

function readPermission(): NotificationPermission | 'unsupported' {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission;
}

/**
 * Wave 30 Web Push subscription hook.
 *
 * Returns a small state machine: after mount, `subscribe()` triggers permission
 * prompts + service-worker registration + a push subscription + the
 * planterClient insert; `unsubscribe()` reverses it and DELETEs the row.
 *
 * Multi-device aware: `subscription` always reflects THIS browser's row
 * (matched by endpoint against the DB's full list for the user), so Device A
 * never shows "Disable" because Device B happens to be subscribed, and
 * unsubscribe never deletes a sibling device's row.
 *
 * `isSupported` is true only when the browser exposes both `navigator.serviceWorker`
 * and `window.PushManager`. Falsy on the server (SSR / test) and on Safari
 * without an installed PWA (PWA shell is not currently on the roadmap).
 */
export function usePushSubscription() {
    const { user } = useAuth();
    const [subscription, setSubscription] = useState<PushSubscriptionRow | null>(null);
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [permissionState, setPermissionState] = useState<NotificationPermission | 'unsupported'>(() => readPermission());

    // Computed once per mount — browser API availability doesn't change during a session.
    const isSupported = useMemo(
        () =>
            typeof navigator !== 'undefined'
            && 'serviceWorker' in navigator
            && typeof window !== 'undefined'
            && 'PushManager' in window
            && typeof Notification !== 'undefined',
        [],
    );

    // On mount (when supported and logged in) match the DB row to the CURRENT
    // browser's endpoint. RLS filters to the caller's rows; `pushManager.getSubscription()`
    // returns THIS browser's push handle (or null). Picking `rows[0]` blindly breaks
    // multi-device — flagged in the Gemini PR review.
    useEffect(() => {
        if (!isSupported || !user) return;
        let cancelled = false;
        (async () => {
            try {
                const [rows, registration] = await Promise.all([
                    planter.entities.PushSubscription.list(),
                    navigator.serviceWorker.getRegistration('/'),
                ]);
                if (cancelled) return;
                const browserSub = await registration?.pushManager.getSubscription();
                if (cancelled) return;
                const currentSub = browserSub
                    ? rows.find((r) => r.endpoint === browserSub.endpoint) ?? null
                    : null;
                setSubscription(currentSub);
            } catch (err) {
                console.warn('[usePushSubscription] hydrate failed', err);
            }
        })();
        return () => { cancelled = true; };
    }, [isSupported, user]);

    const subscribe = useCallback(async (): Promise<void> => {
        if (!isSupported || !user) return;
        setIsSubscribing(true);
        try {
            const permission = await Notification.requestPermission();
            setPermissionState(permission);
            if (permission !== 'granted') return;

            const registration = await navigator.serviceWorker.register('/sw.js');
            const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!publicKey) {
                console.error('[usePushSubscription] missing VITE_VAPID_PUBLIC_KEY');
                return;
            }
            const sub = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                // Cast avoids TS strict `ArrayBuffer` vs `ArrayBufferLike` mismatch on
                // DOM lib typings; Uint8Array is the runtime-correct shape for VAPID keys.
                applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
            });

            const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
            if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
                console.error('[usePushSubscription] PushSubscription.toJSON returned incomplete payload');
                return;
            }
            const inserted = await planter.entities.PushSubscription.create({
                user_id: user.id,
                endpoint: raw.endpoint,
                p256dh: raw.keys.p256dh,
                auth: raw.keys.auth,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
            });
            setSubscription(inserted);
        } catch (err) {
            console.error('[usePushSubscription] subscribe failed', err);
        } finally {
            setIsSubscribing(false);
        }
    }, [isSupported, user]);

    const unsubscribe = useCallback(async (): Promise<void> => {
        if (!subscription) return;
        try {
            if (isSupported) {
                // Scope URL (`/`), not script URL. The service worker registers from
                // `/sw.js` but its scope is the origin root.
                const registration = await navigator.serviceWorker.getRegistration('/');
                const existing = await registration?.pushManager.getSubscription();
                if (existing) await existing.unsubscribe();
            }
            await planter.entities.PushSubscription.deleteByEndpoint(subscription.endpoint);
            setSubscription(null);
        } catch (err) {
            console.error('[usePushSubscription] unsubscribe failed', err);
        }
    }, [subscription, isSupported]);

    return {
        subscription,
        isSubscribing,
        subscribe,
        unsubscribe,
        isSupported,
        permissionState,
    };
}
