"use client";

import { useEffect } from "react";

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
    let registration: ServiceWorkerRegistration | null = null;
    const reloadForUpdate = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    const onChange = () => {
      if (hadController) reloadForUpdate();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "APP_SHELL_UPDATED") reloadForUpdate();
    };
    const checkForUpdate = () => {
      if (document.visibilityState === "visible" && navigator.onLine) registration?.update().catch(() => {});
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    navigator.serviceWorker.addEventListener("message", onMessage);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
      .then((next) => {
        registration = next;
        checkForUpdate();
      })
      .catch(() => {});
    document.addEventListener("visibilitychange", checkForUpdate);
    const timer = window.setInterval(checkForUpdate, 30 * 60 * 1000);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
