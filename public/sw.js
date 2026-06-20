const CACHE = "splitwisest-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache API/auth traffic — always live.
  if (url.pathname.startsWith("/api/")) return;

  // Hashed build assets are immutable: cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          })
      )
    );
    return;
  }

  // Everything else: network-first so behavior matches the live app. We deliberately
  // do NOT cache navigation HTML — a cached app shell can reference a previous
  // deploy's chunk hashes and fail a dynamic import after an update; offline
  // navigations fall back to the precached offline page instead. Only icons are
  // cached (immutable enough, and used by the manifest/install UI).
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && url.pathname.startsWith("/icon")) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        if (request.mode === "navigate") {
          return caches.match(OFFLINE_URL);
        }
        const cached = await caches.match(request);
        return cached || Response.error();
      })
  );
});
