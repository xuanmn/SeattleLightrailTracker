/**
 * Seattle Light Rail Tracker - Progressive Web App Service Worker
 * Provides offline caching for underground transit stations and rapid app launch.
 */

const SW_VERSION = "1.4.0";

// Replaced at build time by the sw-precache Vite plugin (see scripts/sw-manifest.ts).
// BUILD_ID is a content hash of the build output, so every deploy gets a fresh cache
// and the previous one is deleted on activate. BUILD_ASSETS lists every hashed JS/CSS file.
const BUILD_ID = "dev";
const BUILD_ASSETS = [];

const CACHE_NAME = `link-tracker-v${SW_VERSION}-${BUILD_ID}`;

// Max time to wait for the network on page navigations before serving the cached shell
const NAV_TIMEOUT_MS = 3000;

// Vite emits content-hashed, immutable bundles into this directory
const HASHED_ASSETS_PATH = new URL("./assets/", self.location.href).pathname;

// Core assets required for the app shell to render offline
const PRECACHE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  ...BUILD_ASSETS,
];

// Install Event: pre-cache the app shell and every hashed bundle of this build
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.warn("PWA Precache failed:", err)),
  );
});

// Activate Event: delete caches from previous builds
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Cache-First: serve from cache, otherwise fetch once and store.
 * Used for immutable resources whose URL changes whenever their content does.
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return Response.error();
  }
}

/**
 * Stale-While-Revalidate: serve from cache immediately and refresh in the background.
 * Used for unhashed static files (icons, manifest) that may change between deploys.
 */
async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(async (networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        await cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse || Response.error());

  if (cachedResponse) {
    // Keep the SW alive until the background refresh finishes
    event.waitUntil(fetchPromise.then(() => undefined));
    return cachedResponse;
  }
  return fetchPromise;
}

// Fetch Event: Smart routing based on resource type
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Ignore non-GET requests
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 1. OneBusAway API requests: Network-Only with graceful client fallback
  // Live arrival countdowns change every second and should never be frozen in disk cache.
  if (url.hostname.includes("onebusaway.org")) {
    return;
  }

  // 2. Google Fonts & CDN assets: Cache-First with background population
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3. Navigation requests (HTML): Network-First with a timeout + Cache fallback.
  // Underground "lie-fi" connections can stall indefinitely; after NAV_TIMEOUT_MS we serve
  // the cached shell instead (the network response still refreshes the cache when it lands).
  if (request.mode === "navigate") {
    const getCachedShell = async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request)) || (await cache.match("./")) || (await cache.match("./index.html"));
    };

    const networkPromise = fetch(request);
    // Refresh the cached shell in the background without delaying the response;
    // waitUntil keeps the SW alive even if the timeout already served the cached copy.
    event.waitUntil(
      networkPromise
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse.clone());
          }
        })
        .catch(() => undefined),
    );

    let timeoutId;
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = setTimeout(async () => resolve((await getCachedShell()) || networkPromise), NAV_TIMEOUT_MS);
    });

    event.respondWith(
      Promise.race([
        networkPromise.finally(() => clearTimeout(timeoutId)),
        timeoutPromise,
      ]).catch(async () => (await getCachedShell()) || Response.error()),
    );
    return;
  }

  // 4. Hashed build bundles (JS/CSS): Cache-First. Their filenames change whenever their
  // content does, so revalidating them on every launch would only waste cellular data.
  if (url.origin === self.location.origin && url.pathname.startsWith(HASHED_ASSETS_PATH)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 5. Other static files (Icons, Manifest): Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(event));
});
