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
  // userVisibleOnly: true means the browser (Chrome especially) WILL
  // surface a generic "this site has been updated in the background"
  // notification if we don't call showNotification for every push. So
  // even for a data-less or malformed payload, fall back to a neutral
  // notification rather than returning early — otherwise real users
  // see a confusing ghost notification we can't customize.
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { body: event.data.text() };
    }
  }
  const title = payload.title || 'D-Global';
  const options = {
    body: payload.body || 'New update from D-Global.',
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
      // Preferred ordering:
      //  1. A tab already at the target URL → just focus it. Don't
      //     re-navigate (scroll/form state would be lost).
      //  2. A tab somewhere else on our origin that can navigate() →
      //     hijack that one. Saves a tab vs. opening yet another.
      //  3. A focusable tab on a browser without client.navigate
      //     (Firefox) → openWindow(target) instead; silently focusing
      //     an unrelated tab leaves the user with no visible result
      //     of the notification click.
      //  4. Nothing open → openWindow(target).
      //
      // Resolve target against each client's origin so pathname
      // comparison works for both relative ("/events/x") and absolute
      // payload URLs.
      const matching = windows.find((w) => {
        try {
          const resolved = new URL(target, w.url);
          const current = new URL(w.url);
          return resolved.origin === current.origin && resolved.pathname === current.pathname;
        } catch {
          return false;
        }
      });
      if (matching && 'focus' in matching) return matching.focus();
      const navigable = windows.find((w) => 'focus' in w && typeof w.navigate === 'function');
      if (navigable) return navigable.navigate(target).then((c) => (c || navigable).focus());
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
