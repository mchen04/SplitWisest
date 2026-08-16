const STATIC_CACHE = "splitwisest-static-v2";
const PAGE_CACHE = "splitwisest-pages-v2";
const META_CACHE = "splitwisest-meta-v2";
const SHELL_UPDATE_KEY = "/__splitwisest_shell_updated__";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon.svg", "/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)),
      caches.open(PAGE_CACHE).then((cache) => cache.add("/")),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  const current = new Set([STATIC_CACHE, PAGE_CACHE, META_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !current.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function notifyShellUpdate() {
  const meta = await caches.open(META_CACHE);
  await meta.put(SHELL_UPDATE_KEY, new Response(String(Date.now())));
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: "APP_SHELL_UPDATED" });
}

async function refreshPage(request, cached) {
  const response = await fetch(request);
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return response;

  let changed = false;
  if (cached) {
    const [oldHtml, nextHtml] = await Promise.all([cached.clone().text(), response.clone().text()]);
    changed = oldHtml !== nextHtml;
  }
  const cache = await caches.open(PAGE_CACHE);
  await cache.put(request, response.clone());
  if (changed) await notifyShellUpdate();
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    const cachedPromise = caches.open(PAGE_CACHE).then((cache) => cache.match(request));
    let networkPromise;
    const network = (cached) => {
      networkPromise ??= refreshPage(request, cached);
      return networkPromise;
    };

    event.waitUntil(
      cachedPromise.then((cached) => cached ? network(cached).catch(() => undefined) : undefined)
    );
    event.respondWith(
      cachedPromise.then((cached) => {
        if (cached) return cached;
        return network(null).catch(() => caches.match(OFFLINE_URL));
      })
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())));
        }
        return response;
      }))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const update = fetch(request).then((response) => {
        if (response.ok) {
          event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone())));
        }
        return response;
      });
      if (cached) {
        event.waitUntil(update.catch(() => undefined));
        return cached;
      }
      return update.catch(() => Response.error());
    })
  );
});
