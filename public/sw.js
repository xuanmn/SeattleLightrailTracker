/**
 * Seattle Light Rail Tracker - Progressive Web App Service Worker
 * Provides offline caching for underground transit stations and rapid app launch.
 */

const SW_VERSION = '1.2.0';
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

// Install Event: pre-cache the critical app shell + discover hashed bundles from index.html
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        // Pre-cache known static assets
        await cache.addAll(PRECACHE_ASSETS);

        // Dynamically discover hashed JS/CSS bundles referenced in index.html
        // so the first offline visit after install has everything it needs
        try {
          const htmlResponse = (await cache.match('./index.html')) || (await fetch('./index.html'));
          const htmlText = await htmlResponse.text();
          const assetUrls = [];
          const matches = htmlText.matchAll(/(?:src|href)=["'](\.\/?assets\/[^"']+)["']/g);
          for (const match of matches) {
            assetUrls.push(new URL(match[1], self.location.href).href);
          }
          if (assetUrls.length > 0) {
            await cache.addAll(assetUrls);
          }
        } catch (err) {
          // Non-fatal: hashed bundles will be cached on first stale-while-revalidate hit
          console.warn('PWA: Could not discover hashed bundles from index.html:', err);
        }
      })
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

  // 3. Navigation requests (HTML): Network-First with Cache fallback for offline transit use
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('./index.html')) || (await cache.match('./'));
        })
    );
    return;
  }

  // 4. App static assets (Hashed JS, CSS, Images, Icons): Stale-While-Revalidate
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
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    )
  );
});
