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
  const method = opts.method ?? (opts.body || opts.form ? "POST" : "GET");
  const res = await fetch(path, {
    method,
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new ApiClientError("Not authenticated", 401);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiClientError(json.error ?? "Request failed", res.status);
  // Any successful mutation invalidates the read cache so the next render
  // refetches instead of serving pre-mutation data.
  if (method !== "GET") {
    dataCache.clear();
    if (path.startsWith("/api/auth") || path.startsWith("/api/me")) meCache = null;
  }
  return json as T;
}

// --- Read-side cache -------------------------------------------------------
// GET responses are cached at module level (stale-while-revalidate): a
// remounting hook renders the last known payload instantly while a fresh fetch
// runs in the background. Identical concurrent GETs share one request.
const dataCache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

// Synchronous read of the last cached payload for a path (or null). Pages that
// manage their own fetch state use this to seed useState so a revisit renders
// the previous data instantly instead of flashing a skeleton.
export function cacheGet<T>(path: string): T | null {
  return (dataCache.get(path) as T | undefined) ?? null;
}

export function apiCached<T>(path: string): Promise<T> {
  const pending = inflight.get(path);
  if (pending) return pending as Promise<T>;
  const p = api<T>(path)
    .then((json) => {
      dataCache.set(path, json);
      return json;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p as Promise<T>;
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

export interface Unread {
  messages: number;
  activity: number;
  nudges: number;
  requests: number;
  balances: number;
}

export interface SyncCursors {
  activityCursor: number;
  messageCursor: number;
  nudgeCursor: number;
  requestCursor: number;
  unread?: Unread;
}

// Mark a read scope ('activity', 'msg:group:<id>', 'msg:dm:<friendId>') seen up
// to lastId. Fire-and-forget — a failed mark just leaves the badge until the
// next view.
export function markRead(scope: string, lastId: number) {
  api("/api/read", { body: { scope, lastId } }).catch(() => {});
}

// --- Shared sync poller ----------------------------------------------------
// One module-level loop polls /api/sync and fans the cursors out to every
// subscriber. Previously each useUnread/useSync/useApiData instance ran its
// own polling loop, so a busy page issued the same request several times per
// tick. The loop runs only while at least one subscriber is mounted.
const SYNC_INTERVAL_MS = 4000;
const syncListeners = new Set<(c: SyncCursors) => void>();
let lastSync: SyncCursors | null = null;
let syncLoopRunning = false;
let syncWake: (() => void) | null = null;

function ensureSyncLoop() {
  if (syncLoopRunning) return;
  syncLoopRunning = true;
  (async () => {
    while (syncListeners.size > 0) {
      try {
        const c = await api<SyncCursors>("/api/sync");
        lastSync = c;
        for (const l of [...syncListeners]) l(c);
      } catch {
        // offline or logged out; keep trying quietly
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, document.hidden ? SYNC_INTERVAL_MS * 4 : SYNC_INTERVAL_MS);
        syncWake = () => {
          clearTimeout(t);
          resolve();
        };
      });
      syncWake = null;
    }
    syncLoopRunning = false;
  })();
}

function subscribeSync(listener: (c: SyncCursors) => void): () => void {
  syncListeners.add(listener);
  ensureSyncLoop();
  return () => {
    syncListeners.delete(listener);
    if (syncListeners.size === 0) syncWake?.();
  };
}

// Exposes the latest unread counts for nav badges via the shared sync poller.
export function useUnread(): Unread {
  const [unread, setUnread] = useState<Unread>(
    () => lastSync?.unread ?? { messages: 0, activity: 0, nudges: 0, requests: 0, balances: 0 }
  );
  useEffect(() => subscribeSync((c) => {
    if (!c.unread) return;
    const u = c.unread;
    // Keep the previous object when counts are unchanged so the shell doesn't
    // re-render (and repaint) on every poll tick.
    setUnread((prev) =>
      prev.messages === u.messages && prev.activity === u.activity && prev.nudges === u.nudges &&
      prev.requests === u.requests && prev.balances === u.balances ? prev : u
    );
  }), []);
  return unread;
}

// Invokes onChange whenever a sync cursor advances. This is the realtime
// backbone: cheap, serverless-friendly, no websockets to break.
export function useSync(onChange: ((c: SyncCursors) => void) | undefined) {
  const enabled = !!onChange;
  const last = useRef<SyncCursors | null>(null);
  const cb = useRef(onChange);
  useEffect(() => {
    cb.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!enabled) return;
    return subscribeSync((c) => {
      const prev = last.current;
      last.current = c;
      if (prev && (
        c.activityCursor !== prev.activityCursor ||
        c.messageCursor !== prev.messageCursor ||
        c.nudgeCursor !== prev.nudgeCursor ||
        c.requestCursor !== prev.requestCursor
      )) {
        cb.current?.(c);
      }
    });
  }, [enabled]);
}

// Fetches `path`, refreshes on every sync tick, and exposes a manual reload.
// `debounceMs` delays the fetch (used for search-as-you-type). Existing pages
// can keep rendering skeletons off `data === null`, while newer flows can show
// the returned error instead of looking like they are loading forever.
export function useApiData<T>(
  path: string,
  debounceMs = 0,
  opts: { sync?: boolean } = {}
): { data: T | null; error: string | null; status: number | null; reload: () => void } {
  const [state, setState] = useState<{ path: string; data: T | null; error: string | null; status: number | null }>({
    path,
    data: null,
    error: null,
    status: null,
  });
  const reload = useCallback(() => {
    const requestedPath = path;
    apiCached<T>(path)
      .then((next) => {
        // Skip the state update when the payload is byte-identical to what we
        // already render — background refreshes shouldn't repaint anything.
        setState((prev) =>
          prev.path === requestedPath && prev.error === null && prev.data !== null &&
          JSON.stringify(prev.data) === JSON.stringify(next)
            ? prev
            : { path: requestedPath, data: next, error: null, status: 200 }
        );
      })
      .catch((err) => {
        setState({
          path: requestedPath,
          data: null,
          error: err instanceof ApiClientError ? err.message : "Could not load data",
          status: err instanceof ApiClientError ? err.status : null,
        });
      });
  }, [path]);
  useEffect(() => {
    const t = setTimeout(reload, debounceMs);
    return () => clearTimeout(t);
  }, [reload, debounceMs]);
  useSync(opts.sync === false ? undefined : reload);
  // While the fresh fetch is in flight (or after a path change), serve the
  // last cached payload for this path so navigation renders instantly.
  const cached = (dataCache.get(path) as T | undefined) ?? null;
  return {
    data: state.path === path ? state.data ?? cached : cached,
    error: state.path === path ? state.error : null,
    status: state.path === path ? state.status : null,
    reload,
  };
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

interface MeUser { id: number; username: string; displayName: string; inviteCode: string }
let meCache: MeUser | null = null;

export function useMe() {
  const [me, setMe] = useState<MeUser | null>(meCache);
  useEffect(() => {
    if (meCache) return;
    apiCached<{ user: MeUser }>("/api/me")
      .then((r) => {
        meCache = r.user;
        setMe(r.user);
      })
      .catch(() => {});
  }, []);
  return me;
}

export { CURRENCIES } from "./currencies";
