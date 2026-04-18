// Web push service worker. Kept intentionally minimal — no caching
// strategy, no precache manifest. The only job is to receive push
// payloads and surface them as system notifications.
//
// File served at /sw.js so the registration scope is the entire origin.
// If you ever add app-shell caching, do it here behind a version flag
// so an old cache can't ship stale prices on event detail pages.

self.addEventListener('install', () => {
  // Take over immediately so the first push after subscribe doesn't
  // wait for a tab close + reopen cycle.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'D-Global', body: event.data.text() };
  }
  const title = payload.title || 'D-Global';
  const options = {
    body: payload.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    data: { url: payload.url || '/' },
    tag: payload.tag,
    renotify: !!payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse an existing tab if one is already on this origin —
      // double-clicking a notification shouldn't open four copies.
      // `client.navigate` isn't on Firefox; fall back to focus + openWindow.
      for (const w of windows) {
        if ('focus' in w) {
          if (typeof w.navigate === 'function') {
            return w.navigate(target).then(() => w.focus());
          }
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
