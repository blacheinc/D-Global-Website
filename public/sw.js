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

// pushsubscriptionchange fires when the browser invalidates or rotates
// the current subscription (push service migration, quota reset,
// Safari's periodic auto-refresh). The spec-correct response is to
// re-subscribe using the same applicationServerKey and POST the new
// subscription back so our DB row stays live. Without this handler,
// the subscription silently dies and we only learn about it on the
// next broadcast when the push service returns 410.
//
// The SW has no access to build-time env, so we fetch the VAPID public
// key at runtime from /api/push/vapid-key.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const res = await fetch('/api/push/vapid-key');
        if (res.status === 204 || !res.ok) return;
        const { key } = await res.json();
        if (!key) return;
        const applicationServerKey = urlBase64ToUint8Array(key);
        const fresh = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(fresh.toJSON()),
        });
      } catch {
        // Nothing we can show to the user from the SW context — the
        // next sender attempt will prune the dead endpoint anyway.
      }
    })(),
  );
});

// Small base64url → Uint8Array helper duplicated from SubscribeButton
// because the SW lives in its own global scope.
function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
