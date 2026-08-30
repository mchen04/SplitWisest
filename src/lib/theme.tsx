"use client";

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "splitwisest-theme";
const SYSTEM_QUERY = "(prefers-color-scheme: dark)";

export function resolveThemePreference(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return prefersDark ? "dark" : "light";
}

/** Apply the saved or system theme before the first paint. */
export const themeInitScript = `(function(){var s=null;try{s=localStorage.getItem('${STORAGE_KEY}')}catch(e){}var d=typeof matchMedia==='function'&&matchMedia('${SYSTEM_QUERY}').matches;var t=s==='light'||s==='dark'?s:(d?'dark':'light');document.documentElement.setAttribute('data-theme',t)})();`;

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(SYSTEM_QUERY).matches
    : false;
}

function storedTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function current(): Theme {
  if (typeof document === "undefined") return "light";
  return resolveThemePreference(document.documentElement.getAttribute("data-theme"), systemPrefersDark());
}

const subscribers = new Set<() => void>();
let stopBrowserListeners: (() => void) | null = null;
let sessionTheme: Theme | null = null;

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function syncTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  notify();
}

function startBrowserListeners() {
  if (stopBrowserListeners || typeof window === "undefined") return;
  const media = window.matchMedia?.(SYSTEM_QUERY);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    sessionTheme = null;
    syncTheme(resolveThemePreference(event.newValue, systemPrefersDark()));
  };
  const onSystemChange = (event: MediaQueryListEvent) => {
    if (sessionTheme || storedTheme()) return;
    syncTheme(event.matches ? "dark" : "light");
  };

  window.addEventListener("storage", onStorage);
  if (media?.addEventListener) media.addEventListener("change", onSystemChange);
  else media?.addListener(onSystemChange);
  stopBrowserListeners = () => {
    window.removeEventListener("storage", onStorage);
    if (media?.removeEventListener) media.removeEventListener("change", onSystemChange);
    else media?.removeListener(onSystemChange);
    stopBrowserListeners = null;
  };
}

function subscribe(subscriber: () => void) {
  subscribers.add(subscriber);
  startBrowserListeners();
  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) stopBrowserListeners?.();
  };
}

function apply(theme: Theme) {
  sessionTheme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Keep the explicit theme in memory when storage is unavailable. */
  }
  notify();
}

/** Read and toggle the active theme across every mounted theme control. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, current, () => "light");
  const toggle = () => apply(theme === "dark" ? "light" : "dark");
  return { theme, toggle };
}
