// App-shell caching. iOS evicts the HTTP cache of home-screen apps aggressively, so
// hashed bundles are kept in Cache Storage and served without touching the network.
const CACHE = 'besmart-shell-v3';
const ENTRY = /\/assets\/index-[\w-]+\.js/;

// A deploy renames the bundles, and nothing asks for the old names again, so without this
// every deploy would leave its bundles in Cache Storage for good. When the page names a
// new entry bundle, drop the cached assets; the new page fetches the ones it needs.
async function cacheShell(res) {
  const cache = await caches.open(CACHE);
  const old = await cache.match('/');
  const html = await res.clone().text();
  const entry = html.match(ENTRY)?.[0];
  const oldEntry = old && (await old.text()).match(ENTRY)?.[0];
  if (entry && oldEntry && entry !== oldEntry) {
    const stale = (await cache.keys()).filter((k) => {
      const p = new URL(k.url).pathname;
      return p.startsWith('/assets/') && !html.includes(p); // the page still names its vendor chunk and CSS
    });
    await Promise.all(stale.map((k) => cache.delete(k)));
  }
  await cache.put('/', res);
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build output and icons: cache-first (names change whenever content does).
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Page navigations: network-first so deploys show up immediately, cached shell as fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(async (res) => {
        // Only the app's own page is the offline fallback, never an error page or a download.
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          // Wait for it, so the new page's bundles are cached after the old ones are dropped.
          await cacheShell(res.clone()).catch(() => {});
        }
        return res;
      }).catch(() => caches.match('/'))
    );
  }
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'BeSmart', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
