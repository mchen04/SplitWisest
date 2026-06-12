"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageSquare, Pin, PinOff, Search, Users } from "lucide-react";
import { api, ApiClientError, useMe, useSync } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, EmptyState, Avatar, Button, Input } from "@/components/ui";
import { ChatPane } from "@/components/chat";

interface Conversation {
  kind: "group" | "dm";
  id: number;
  name: string;
  subtitle: string;
  lastBody: string | null;
  lastAt: string | null;
  lastSender: string | null;
  lastId: number;
  unread: boolean;
}

const PIN_KEY = "splitwisest-pinned-chats";

function convKey(c: Pick<Conversation, "kind" | "id">) {
  return `${c.kind}:${c.id}`;
}

function loadPins(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

// Compact timestamp for conversation rows: time today, month+day otherwise.
function fmtRowTime(d: string): string {
  const date = new Date(d);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ChatPageInner() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const groupId = Number(params.get("g"));
  const dmId = Number(params.get("dm"));
  const selectedKey =
    Number.isInteger(groupId) && groupId > 0 ? `group:${groupId}` :
    Number.isInteger(dmId) && dmId > 0 ? `dm:${dmId}` : null;

  function load() {
    setError(null);
    api<{ conversations: Conversation[] }>("/api/conversations")
      .then((r) => setConversations(r.conversations))
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "Could not load conversations");
      });
  }

  useEffect(() => {
    // Initial load + per-device pinned chats.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPins(loadPins());
    load();
  }, []);
  useSync(() => {
    load();
    setRefreshKey((k) => k + 1);
  });

  function togglePin(c: Conversation) {
    setPins((prev) => {
      const key = convKey(c);
      const next = prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key];
      try {
        localStorage.setItem(PIN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const selected = useMemo(
    () => conversations?.find((c) => convKey(c) === selectedKey) ?? null,
    [conversations, selectedKey]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = (conversations ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q)
    );
    const pinRank = (c: Conversation) => {
      const i = pins.indexOf(convKey(c));
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...rows].sort((a, b) => {
      const pa = pinRank(a);
      const pb = pinRank(b);
      if (pa !== pb) return pa - pb;
      return b.lastId - a.lastId || a.name.localeCompare(b.name);
    });
  }, [conversations, query, pins]);

  function open(c: Conversation) {
    // push (not replace) so hardware/browser back returns to the chat list
    router.push(c.kind === "group" ? `/chat?g=${c.id}` : `/chat?dm=${c.id}`, { scroll: false });
  }

  const listPane = (
    <div className={`flex min-h-0 flex-col md:w-80 md:shrink-0 md:border-r md:border-line ${selectedKey ? "hidden md:flex" : "flex"}`}>
      <div className="border-b border-line px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="!min-h-9 !py-1.5 pl-8"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {conversations === null && !error ? (
          <div className="space-y-3 p-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : error && conversations === null ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="Could not load conversations"
            hint={error}
            action={<Button variant="secondary" onClick={load}>Retry</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title={query ? "No chats match" : "No conversations yet"}
            hint={query ? "Try a different name." : "Join a group or add a friend to start chatting."}
          />
        ) : (
          <ul>
            {filtered.map((c) => {
              const key = convKey(c);
              const pinned = pins.includes(key);
              const active = key === selectedKey;
              return (
                <li key={key} className="group/row relative border-b border-line last:border-b-0">
                  <button
                    onClick={() => open(c)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-center gap-2.5 py-2 pl-3 pr-10 text-left transition-colors md:pr-3 ${
                      active ? "bg-accent-soft" : "hover:bg-paper"
                    }`}
                  >
                    {c.kind === "group" ? (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                        <Users className="h-4.5 w-4.5" />
                      </span>
                    ) : (
                      <Avatar name={c.name} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={`truncate text-sm ${c.unread ? "font-bold" : "font-medium"}`}>{c.name}</span>
                        {c.lastAt && (
                          <span className="shrink-0 text-[11px] text-ink-faint transition-opacity group-hover/row:opacity-0">
                            {fmtRowTime(c.lastAt)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        {pinned && <Pin className="h-3 w-3 shrink-0 text-ink-faint" aria-label="Pinned" />}
                        <span className={`truncate text-xs ${c.unread ? "font-semibold text-ink" : "text-ink-faint"}`}>
                          {c.lastBody ? `${c.lastSender}: ${c.lastBody}` : c.subtitle}
                        </span>
                        {c.unread && (
                          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread messages" />
                        )}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => togglePin(c)}
                    aria-label={pinned ? `Unpin ${c.name}` : `Pin ${c.name}`}
                    title={pinned ? "Unpin" : "Pin"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint hover:bg-card hover:text-ink md:top-1.5 md:hidden md:translate-y-0 md:p-1 md:group-hover/row:block md:focus-visible:block"
                  >
                    {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const detailPane = (
    <div className={`min-h-0 flex-1 flex-col ${selectedKey ? "flex" : "hidden md:flex"}`}>
      {selected ? (
        <>
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
            <button
              onClick={() => router.replace("/chat", { scroll: false })}
              aria-label="Back to all chats"
              className="rounded-lg p-1.5 text-ink-soft hover:bg-paper md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            {selected.kind === "group" ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                <Users className="h-4 w-4" />
              </span>
            ) : (
              <Avatar name={selected.name} size="sm" />
            )}
            <div className="min-w-0 flex-1">
              <Link
                href={selected.kind === "group" ? `/groups/${selected.id}` : `/people/${selected.id}`}
                className="block truncate text-sm font-semibold hover:text-accent-dark hover:underline"
              >
                {selected.name}
              </Link>
              <p className="truncate text-xs text-ink-faint">{selected.subtitle}</p>
            </div>
            <Link
              href={selected.kind === "group" ? `/groups/${selected.id}` : `/people/${selected.id}`}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft hover:border-accent hover:text-accent-dark"
            >
              {selected.kind === "group" ? "Open group" : "View profile"}
            </Link>
          </div>
          {me && (
            <ChatPane
              key={selectedKey}
              endpoint={selected.kind === "group" ? `/api/groups/${selected.id}/messages` : `/api/dm/${selected.id}/messages`}
              meId={me.id}
              refreshKey={refreshKey}
              emptyHint="No messages yet — start the conversation."
              readScope={selected.kind === "group" ? `msg:group:${selected.id}` : `msg:dm:${selected.id}`}
              fill
            />
          )}
        </>
      ) : selectedKey && conversations === null ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="skeleton h-10 w-48" />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div>
            <MessageSquare className="mx-auto h-8 w-8 text-ink-faint" />
            <p className="mt-3 font-medium text-ink-soft">
              {selectedKey ? "Conversation not found" : "Select a conversation"}
            </p>
            <p className="mt-1 text-sm text-ink-faint">
              {selectedKey ? "It may have been removed, or you no longer have access." : "Pick a group or friend on the left to start chatting."}
            </p>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <AppShell>
      <div className="mb-4 hidden items-end justify-between md:flex md:shrink-0">
        <div>
          <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Messages</h1>
          <p className="mt-1 text-sm text-ink-soft">Group conversations and direct messages.</p>
        </div>
      </div>
      <Card className="flex h-[calc(100dvh-8.5rem)] min-h-[24rem] flex-col overflow-hidden md:h-auto md:min-h-0 md:flex-1 md:flex-row">
        {listPane}
        {detailPane}
      </Card>
    </AppShell>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
