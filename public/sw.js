/**
 * PlanterPlan service worker — push notification handler.
 *
 * EXCEPTION: this is the only non-TypeScript file in src/. TS conversion is
 * not currently scheduled (the former Wave 32 PWA/workbox track was descoped).
 * Tracked in docs/dev-notes.md.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PlanterPlan', body: event.data.text() };
  }
  const { title = 'PlanterPlan', body = '', url = '/', icon = '/icon-192.png', tag } = payload;
  event.waitUntil(
    self.registration.showNotification(title, { body, icon, tag, data: { url } }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
