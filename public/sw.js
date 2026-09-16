/**
 * Seattle Light Rail Tracker - Progressive Web App Service Worker
 * Provides offline caching for underground transit stations and rapid app launch.
 */

const SW_VERSION = '1.1.0';
const CACHE_NAME = `link-tracker-v${SW_VERSION}`;

// Core assets required for the app shell to render offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

// Install Event: pre-cache the critical app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn('PWA Precache failed:', err))
  );
});

// Activate Event: clean up outdated legacy caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Smart routing based on resource type
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignore non-GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 1. OneBusAway API requests: Network-Only with graceful client fallback
  // Live arrival countdowns change every second and should never be frozen in disk cache.
  if (url.hostname.includes('onebusaway.org')) {
    return;
  }

  // 2. Google Fonts & CDN assets: Cache-First with background population
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);
        })
      )
    );
    return;
  }

  // 3. App static assets (HTML, CSS, JS, Images, Icons): Stale-While-Revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback for navigation requests to root index.html
            if (request.mode === 'navigate') {
              return cache.match('./index.html') || cache.match('./');
            }
          });

        return cachedResponse || fetchPromise;
      })
    )
  );
});

// 4. Message Event: allow clients to trigger skipWaiting on update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
