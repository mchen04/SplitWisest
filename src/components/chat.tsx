"use client";

import { useEffect, useRef, useState } from "react";
import { Search, SendHorizonal } from "lucide-react";
import { api, fmtTime, markRead } from "@/lib/client";
import { Avatar, Input } from "./ui";

interface Message {
  id: number;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
}

// Renders message text, turning URLs into links.
function MessageBody({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

export function ChatPane({
  endpoint,
  meId,
  refreshKey,
  emptyHint,
  readScope,
}: {
  endpoint: string; // e.g. /api/groups/1/messages
  meId: number;
  refreshKey: number;
  emptyHint: string;
  readScope?: string; // e.g. msg:group:1 — marks the conversation read on view
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const searchSeq = useRef(0);

  async function loadAll() {
    const seq = ++searchSeq.current;
    const r = await api<{ messages: Message[]; hasMore?: boolean }>(endpoint);
    if (seq !== searchSeq.current) return; // a newer search superseded this
    setMessages(r.messages);
    setHasMoreOlder(!!r.hasMore);
    lastId.current = r.messages.at(-1)?.id ?? 0;
    if (readScope && lastId.current > 0) markRead(readScope, lastId.current);
  }

  // Prepend an older page of history while preserving scroll position.
  async function loadEarlier() {
    if (loadingOlder || !messages || messages.length === 0) return;
    setLoadingOlder(true);
    const before = messages[0].id;
    const scrollEl = scroller.current;
    const prevHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const r = await api<{ messages: Message[]; hasMore?: boolean }>(`${endpoint}?before=${before}`);
      setMessages((m) => {
        const have = new Set((m ?? []).map((x) => x.id));
        return [...r.messages.filter((x) => !have.has(x.id)), ...(m ?? [])];
      });
      setHasMoreOlder(!!r.hasMore);
      // Keep the viewport anchored where the user was after prepending.
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop += scrollEl.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }

  // Serialized + deduped: concurrent callers share one request, and appends
  // skip ids we already have, so a sync tick racing a send can't duplicate.
  function loadNew(): Promise<void> {
    if (inflight.current) return inflight.current;
    const p = (async () => {
      const r = await api<{ messages: Message[] }>(`${endpoint}?since=${lastId.current}`);
      if (r.messages.length > 0) {
        setMessages((m) => {
          const have = new Set((m ?? []).map((x) => x.id));
          return [...(m ?? []), ...r.messages.filter((x) => !have.has(x.id))];
        });
        lastId.current = Math.max(lastId.current, r.messages.at(-1)!.id);
        if (readScope && lastId.current > 0) markRead(readScope, lastId.current);
      }
    })().finally(() => {
      inflight.current = null;
    });
    inflight.current = p;
    return p;
  }

  useEffect(() => {
    loadAll().catch(() => {});
    // loadAll closes over endpoint; re-run only when the conversation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    if (refreshKey > 0 && !searching) loadNew().catch(() => {});
    // Fire on each sync tick (refreshKey bump) only; loadNew/searching are refs
    // or read fresh and intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Scroll to the newest message only when the last id advances (a new message
  // arrived or was sent) — not when older history is prepended.
  const newestMessageId = messages?.at(-1)?.id;
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [newestMessageId]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runSearch(q: string) {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!q.trim()) {
        setSearching(false);
        await loadAll().catch(() => {});
        return;
      }
      setSearching(true);
      const seq = ++searchSeq.current;
      const r = await api<{ messages: Message[] }>(`${endpoint}?q=${encodeURIComponent(q.trim())}`);
      if (seq === searchSeq.current) setMessages(r.messages);
    }, 250);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api(endpoint, { body: { body } });
      setDraft("");
      await loadNew();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[28rem] flex-col md:h-full md:min-h-0">
      <div className="border-b border-line px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={query}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search messages"
            className="!min-h-9 !py-1.5 pl-8"
            aria-label="Search messages"
          />
        </div>
      </div>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {hasMoreOlder && !searching && messages && messages.length > 0 && (
          <div className="text-center">
            <button
              onClick={loadEarlier}
              disabled={loadingOlder}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-ink-soft hover:border-accent disabled:opacity-50"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {messages === null ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-10 w-2/3" />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-faint">{searching ? "No messages match." : emptyHint}</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === meId;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                {!mine && <Avatar name={m.senderName} size="sm" />}
                <div className={`max-w-[78%] ${mine ? "text-right" : ""}`}>
                  <div
                    className={`inline-block rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed ${
                      mine ? "rounded-br-md bg-accent text-on-accent" : "rounded-bl-md bg-paper text-ink"
                    }`}
                  >
                    <MessageBody text={m.body} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-faint">
                    {!mine && <span className="font-medium">{m.senderName} · </span>}
                    {fmtTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={send} className="flex items-center gap-2 border-t border-line px-3 py-2.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          aria-label="Message"
          maxLength={4000}
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent transition-colors hover:bg-accent-dark disabled:opacity-40"
        >
          <SendHorizonal className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
}
