/**
 * Minimal push-only service worker, independent of ngsw.
 * Scoped to /push/ so it never contends with the ngsw registration at /.
 */
self.addEventListener('push', (event) => {
  const payload = event.data ? event.data.json() : {};
  const notification = payload.notification ?? {};
  event.waitUntil(
    self.registration.showNotification(notification.title ?? 'Chaotic-AUR', {
      body: notification.body,
      icon: notification.icon ?? '/android-chrome-512x512.png',
      data: notification.data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url =
    event.notification.data?.onActionClick?.default?.url ?? event.notification.data?.url ?? 'https://chaotic.cx';
  event.waitUntil(clients.openWindow(url));
});
