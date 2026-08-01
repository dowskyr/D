// SOHLAM service worker
// Goal: the installed app should ALWAYS show the latest deployed version —
// no stale content, no manual "clear cache" or reinstall ever required.
//
// Strategy:
//  - The page itself (index.html / navigations) is NEVER served from cache
//    while online. It's fetched fresh from the network every single time
//    the app is opened. Cache is only a fallback for when the device is
//    offline.
//  - Static assets are served cache-first for speed, then refreshed in the
//    background (stale-while-revalidate) so they catch up within one load.
//  - Bump CACHE_VERSION any time you change what this file caches. Old
//    caches are deleted automatically on activate, and the new worker
//    takes over immediately (no waiting for tabs to close).

const CACHE_VERSION = 'sohlam-v2';
const OFFLINE_URL = 'index.html';

self.addEventListener('install', (event) => {
  // Activate this new worker as soon as it's installed — don't wait for
  // old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Take control of any already-open pages immediately.
      await self.clients.claim();
      // Clean out any caches from a previous version.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      );
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Page navigations: network-first, always. This is what guarantees the
  // installed app picks up every update automatically the moment it's
  // opened (as long as there's a connection). Falls back to the last
  // cached copy only when fully offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request, { cache: 'no-store' });
          const cache = await caches.open(CACHE_VERSION);
          cache.put(OFFLINE_URL, fresh.clone());
          return fresh;
        } catch (err) {
          const cache = await caches.open(CACHE_VERSION);
          const cached = await cache.match(OFFLINE_URL);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Everything else (images, fonts, etc.): stale-while-revalidate — fast
  // from cache, refreshed quietly in the background for next time.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })()
  );
});
