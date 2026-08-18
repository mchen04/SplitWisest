"use client";

import { useEffect } from "react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID;
const META_CACHE = "splitwisest-meta-v2";
const SHELL_UPDATE_KEY = "/__splitwisest_shell_updated__";
const VERSION_KEY = "/__splitwisest_version__";
const RELOAD_KEY = "splitwisest.reloadedFor";
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_THROTTLE_MS = 60 * 1000;

/** Clear what the next navigation has to re-fetch, keeping the offline shell. */
async function dropStaleCaches(version: string) {
  if (!("caches" in window)) return;
  const names = await caches.keys();
  await Promise.all(
    names.map(async (name) => {
      if (name.startsWith("splitwisest-pages")) {
        await caches.delete(name);
        return;
      }
      if (!name.startsWith("splitwisest-static")) return;
      // Keep the offline page and the icons; only the build's chunks are stale.
      const cache = await caches.open(name);
      const requests = await cache.keys();
      await Promise.all(
        requests
          .filter((request) => new URL(request.url).pathname.startsWith("/_next/static/"))
          .map((request) => cache.delete(request))
      );
    })
  );
  // Record the build about to load, so the worker's own change detection does
  // not read this reload as a second update and bounce the page again.
  const meta = await caches.open(META_CACHE);
  await meta.put(VERSION_KEY, new Response(version));
  await meta.delete(SHELL_UPDATE_KEY);
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // The SW caches /_next/static/ cache-first, which is only safe for
    // production's content-hashed chunk names. In dev those names are stable,
    // so a registered SW serves stale code — unregister it and purge caches.
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((rs) => Promise.all(rs.map((r) => r.unregister())))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }
    // When an updated SW takes control (skipWaiting + clients.claim), reload once so
    // the page picks up the new build's chunks instead of risking a chunk-load
    // error mid-session. Skip the reload on the very first install (no prior
    // controller), which isn't an update.
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    let lastCheck = 0;
    let registration: ServiceWorkerRegistration | null = null;
    const reloadForUpdate = async (force = false) => {
      if (reloaded) return;
      let pending = force;
      if ("caches" in window) {
        const meta = await caches.open(META_CACHE);
        pending = (await meta.match(SHELL_UPDATE_KEY)) !== undefined || pending;
        if (pending) await meta.delete(SHELL_UPDATE_KEY);
      }
      if (!pending) return;
      reloaded = true;
      window.location.reload();
    };
    // A deploy never changes sw.js, so `registration.update()` finds no new
    // worker and the install path never runs. The worker's other update route —
    // diffing HTML on a navigation — needs a navigation, which an iOS PWA
    // restored from memory never makes. Left to those two, an installed app can
    // sit on a build for days. Asking the server which build is live closes it.
    const checkVersion = async () => {
      if (!BUILD_ID || reloaded) return;
      let payload: { version?: unknown };
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        payload = await response.json();
      } catch {
        return; // Offline, or the deploy is mid-flight. The next check retries.
      }
      const version = payload.version;
      if (typeof version !== "string" || !version || version === BUILD_ID) return;
      // If a reload already failed to land this build, stop instead of looping.
      if (sessionStorage.getItem(RELOAD_KEY) === version) return;
      sessionStorage.setItem(RELOAD_KEY, version);
      reloaded = true;
      await dropStaleCaches(version);
      window.location.reload();
    };
    const onChange = () => {
      if (hadController) reloadForUpdate(true);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "APP_SHELL_UPDATED") reloadForUpdate(true);
    };
    const checkForUpdate = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (Date.now() - lastCheck < CHECK_THROTTLE_MS) return;
      lastCheck = Date.now();
      registration?.update().catch(() => {});
      checkVersion();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((next) => {
        registration = next;
        reloadForUpdate();
        checkForUpdate();
      })
      .catch(() => {});
    document.addEventListener("visibilitychange", checkForUpdate);
    window.addEventListener("online", checkForUpdate);
    const timer = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkForUpdate);
      window.removeEventListener("online", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
