/**
 * PlanterPlan service worker — push notification handler.
 *
 * EXCEPTION: this is the only non-TypeScript file shipped by the app. TS
 * conversion is not currently scheduled (the former Wave 32 PWA/workbox track
 * was descoped). Tracked in docs/dev-notes.md.
 *
 * This worker intentionally has no `fetch` handler and no cache storage logic:
 * it must not precache app assets or serve stale UI while the PWA stack is
 * descoped. Keep the contract to install/activate/push/notificationclick.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function safePath(value, fallback = '/') {
  const fallbackPath = fallback.startsWith('/') ? fallback : '/';
  if (typeof value !== 'string' || value.trim().length === 0) return fallbackPath;
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return fallbackPath;
    return `${url.pathname}${url.search}${url.hash}` || fallbackPath;
  } catch {
    return fallbackPath;
  }
}

function parsePushPayload(data) {
  let payload;
  try {
    payload = data.json();
  } catch {
    payload = { body: data.text() };
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    payload = { body: data.text() };
  }
  return {
    title: safeText(payload.title, 'PlanterPlan'),
    body: safeText(payload.body),
    icon: safePath(payload.icon, '/icon-192.png'),
    tag: typeof payload.tag === 'string' && payload.tag.trim().length > 0 ? payload.tag : undefined,
    url: safePath(payload.url),
  };
}

self.addEventListener('push', (event) => {
  if (!event.data) return;
  const { title, body, url, icon, tag } = parsePushPayload(event.data);
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, tag, data: { url } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safePath(event.notification.data?.url);
  event.waitUntil(self.clients.openWindow(url));
});
