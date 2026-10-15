const SHELL_CACHE = 'velour-shell-v1';
const MEDIA_CACHE = 'velour-media-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/favicon.ico',
];

// Install: Cache initial app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== MEDIA_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Intercept and serve cached media & shell
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass non-GET requests or browser extension requests
  if (req.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Supabase API calls are handled by IndexedDB offline layer
  if (url.hostname.includes('supabase.co')) return;

  // 1. Navigation requests (HTML SPA routing): Network-first with cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return caches.match('/');
        })
    );
    return;
  }

  // 2. Static Vite Assets (.js, .css, .woff2, fonts)
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes.ok) {
              const copy = networkRes.clone();
              caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
            }
            return networkRes;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Images, videos, and media files (Cloudflare R2, avatars, story media)
  if (
    req.destination === 'image' ||
    req.destination === 'video' ||
    req.destination === 'audio' ||
    url.pathname.match(/\.(png|jpe?g|webp|gif|svg|mp3|mp4|webm)$/i)
  ) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const match = await cache.match(req);
        if (match) return match;

        try {
          const networkRes = await fetch(req);
          if (networkRes && networkRes.ok) {
            cache.put(req, networkRes.clone());
          }
          return networkRes;
        } catch (_) {
          return match || new Response('', { status: 408 });
        }
      })
    );
    return;
  }
});
