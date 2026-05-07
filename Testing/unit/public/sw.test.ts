import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

type ServiceWorkerHandler = (event: Record<string, unknown>) => void;

function loadWorker() {
    const listeners = new Map<string, ServiceWorkerHandler>();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const openWindow = vi.fn().mockResolvedValue(undefined);
    const worker = {
        location: { origin: 'https://planter.test' },
        skipWaiting: vi.fn(),
        clients: {
            claim: vi.fn(),
            openWindow,
        },
        registration: {
            showNotification,
        },
        addEventListener: vi.fn((eventName: string, handler: ServiceWorkerHandler) => {
            listeners.set(eventName, handler);
        }),
    };

    const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
    vm.runInNewContext(source, { self: worker, URL });

    return { listeners, showNotification, openWindow, worker };
}

function makeWaitEvent(extra: Record<string, unknown>) {
    const waits: Promise<unknown>[] = [];
    return {
        event: {
            ...extra,
            waitUntil: vi.fn((promise: Promise<unknown>) => {
                waits.push(Promise.resolve(promise));
            }),
        },
        waits,
    };
}

describe('public/sw.js', () => {
    it('keeps the worker contract to lifecycle and push handlers only', () => {
        const { listeners } = loadWorker();

        expect([...listeners.keys()].sort()).toEqual(['activate', 'install', 'notificationclick', 'push']);
        expect(listeners.has('fetch')).toBe(false);
    });

    it('sanitizes push notification URL and icon fields to same-origin paths', async () => {
        const { listeners, showNotification } = loadWorker();
        const { event, waits } = makeWaitEvent({
            data: {
                json: () => ({
                    title: 'Task updated',
                    body: 'Open the task',
                    url: 'https://evil.example/project/p1',
                    icon: 'javascript:alert(1)',
                    tag: 123,
                }),
                text: () => 'fallback text',
            },
        });

        listeners.get('push')?.(event);
        await Promise.all(waits);

        expect(showNotification).toHaveBeenCalledWith('Task updated', {
            body: 'Open the task',
            icon: '/icon-192.png',
            tag: undefined,
            data: { url: '/' },
        });
    });

    it('preserves same-origin absolute notification URLs as paths', async () => {
        const { listeners, showNotification } = loadWorker();
        const { event, waits } = makeWaitEvent({
            data: {
                json: () => ({
                    title: 'Mention',
                    url: 'https://planter.test/project/p1?tab=tasks#comment-1',
                }),
                text: () => '',
            },
        });

        listeners.get('push')?.(event);
        await Promise.all(waits);

        expect(showNotification).toHaveBeenCalledWith('Mention', expect.objectContaining({
            data: { url: '/project/p1?tab=tasks#comment-1' },
        }));
    });

    it('falls back to text payloads when push JSON parsing fails', async () => {
        const { listeners, showNotification } = loadWorker();
        const { event, waits } = makeWaitEvent({
            data: {
                json: () => {
                    throw new Error('invalid json');
                },
                text: () => 'Raw push body',
            },
        });

        listeners.get('push')?.(event);
        await Promise.all(waits);

        expect(showNotification).toHaveBeenCalledWith('PlanterPlan', expect.objectContaining({
            body: 'Raw push body',
            data: { url: '/' },
        }));
    });

    it('opens only sanitized same-origin paths from notification clicks', async () => {
        const { listeners, openWindow } = loadWorker();
        const close = vi.fn();
        const { event, waits } = makeWaitEvent({
            notification: {
                close,
                data: { url: 'javascript:alert(1)' },
            },
        });

        listeners.get('notificationclick')?.(event);
        await Promise.all(waits);

        expect(close).toHaveBeenCalled();
        expect(openWindow).toHaveBeenCalledWith('/');
    });
});
