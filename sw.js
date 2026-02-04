// sw.js (PROFESSIONAL FULL VERSION - Service Worker for PWA)
// - Enables offline support by caching essential assets
// - Caches app shell (HTML, CSS, JS) for fast loading
// - Handles install, activate, and fetch events
// - Updates cache on new deployments
// - Skips waiting to activate immediately

const CACHE_NAME = 'cms-chatbot-v1'; // Version for cache busting
const ASSETS_TO_CACHE = [
  '/',                  // Root
  '/index.html',
  '/welcome.html',
  '/dashboard.html',
  '/logs.html',
  '/style.css',
  '/app.js',
  '/admin.js',
  '/dashboard.js',
  '/logs.js',
  '/manifest.json',
  '/site.webmanifest',
  // Icons and assets (add more as needed)
  '/cms-logo.png',
  '/cms-assistant-512.png',
  '/cms-assistant-192.png',
  '/apple-touch-icon.png',
  '/favicon.ico'
];

/**
 * Install event: Caches assets for offline use.
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Caching assets');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .catch(err => console.error('Service Worker: Cache failed', err))
  );
  self.skipWaiting(); // Activate immediately
});

/**
 * Activate event: Cleans up old caches.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('Service Worker: Deleting old cache', name);
              return caches.delete(name);
            })
        );
      })
  );
  self.clients.claim(); // Take control of all pages immediately
});

/**
 * Fetch event: Serves from cache if offline, otherwise network.
 * Falls back to cache on network failure.
 */
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request)
          .then(networkResponse => {
            // Cache new responses (optional, for dynamic content)
            if (event.request.method === 'GET' && networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Fallback for offline (e.g., return offline page if implemented)
            console.error('Service Worker: Fetch failed, offline');
            return new Response('Offline', { status: 503 });
          });
      })
  );
});