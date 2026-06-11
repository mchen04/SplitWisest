"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export class ApiClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {}
): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new ApiClientError("Not authenticated", 401);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError(json.error ?? "Request failed", res.status);
  return json as T;
}

// Money formatting lives in the framework-agnostic money lib so server routes
// and client components share one implementation.
export { fmtMoney } from "./money";

export function fmtDate(d: string | Date): string {
  return new Date(typeof d === "string" && d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric", year: "numeric" }
  );
}

export function fmtTime(d: string | Date): string {
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface SyncCursors {
  activityCursor: number;
  messageCursor: number;
}

// Polls /api/sync and invokes onChange whenever a cursor advances. This is the
// realtime backbone: cheap, serverless-friendly, no websockets to break.
export function useSync(onChange: (c: SyncCursors) => void, intervalMs = 4000) {
  const last = useRef<SyncCursors | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const c = await api<SyncCursors>("/api/sync");
        if (stopped) return;
        const prev = last.current;
        last.current = c;
        if (prev && (c.activityCursor !== prev.activityCursor || c.messageCursor !== prev.messageCursor)) {
          cb.current(c);
        }
      } catch {
        // offline or logged out; keep trying quietly
      }
      if (!stopped) timer = setTimeout(tick, document.hidden ? intervalMs * 4 : intervalMs);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [intervalMs]);
}

// Fetches `path`, refreshes on every sync tick, and exposes a manual reload.
// `debounceMs` delays the fetch (used for search-as-you-type). Errors are
// swallowed to a null/stale value — pages render skeletons off `data === null`.
export function useApiData<T>(path: string, debounceMs = 0): { data: T | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  const reload = useCallback(() => {
    api<T>(pathRef.current).then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(reload, debounceMs);
    return () => clearTimeout(t);
  }, [path, reload, debounceMs]);
  useSync(reload);
  return { data, reload };
}

// Form submission state for modals: tracks error + busy and wraps a submit in
// the canonical try/catch that unwraps ApiClientError to a user-facing message.
export function useFormState() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<void>, fallback: string) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : fallback);
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, setError, busy, run };
}

// String-valued filter bar state: per-key onChange setters, a reset, and an
// `active` flag (any field non-empty). Used by the expense list filter UIs.
export function useFilters<T extends Record<string, string>>(initial: T) {
  const [filters, setFilters] = useState(initial);
  const setFilter = (k: keyof T) => (e: { target: { value: string } }) =>
    setFilters((f) => ({ ...f, [k]: e.target.value }));
  const reset = () => setFilters(initial);
  return { filters, setFilter, reset, active: Object.values(filters).some(Boolean) };
}

export function useMe() {
  const [me, setMe] = useState<{ id: number; username: string; displayName: string; inviteCode: string } | null>(null);
  useEffect(() => {
    api<{ user: typeof me }>("/api/me").then((r) => setMe(r.user)).catch(() => {});
  }, []);
  return me;
}

export { CURRENCIES } from "./currencies";
