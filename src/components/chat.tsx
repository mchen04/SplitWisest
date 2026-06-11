"use client";

import { useEffect, useRef, useState } from "react";
import { Search, SendHorizonal } from "lucide-react";
import { api, fmtTime } from "@/lib/client";
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
}: {
  endpoint: string; // e.g. /api/groups/1/messages
  meId: number;
  refreshKey: number;
  emptyHint: string;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = useRef(0);

  async function loadAll() {
    const r = await api<{ messages: Message[] }>(endpoint);
    setMessages(r.messages);
    lastId.current = r.messages.at(-1)?.id ?? 0;
  }

  async function loadNew() {
    const r = await api<{ messages: Message[] }>(`${endpoint}?since=${lastId.current}`);
    if (r.messages.length > 0) {
      setMessages((m) => [...(m ?? []), ...r.messages]);
      lastId.current = r.messages.at(-1)!.id;
    }
  }

  useEffect(() => {
    loadAll().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    if (refreshKey > 0 && !searching) loadNew().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages?.length]);

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setSearching(false);
      await loadAll();
      return;
    }
    setSearching(true);
    const r = await api<{ messages: Message[] }>(`${endpoint}?q=${encodeURIComponent(q.trim())}`);
    setMessages(r.messages);
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
    <div className="flex h-[28rem] flex-col">
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
                      mine ? "rounded-br-md bg-accent text-white" : "rounded-bl-md bg-paper text-ink"
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition-colors hover:bg-accent-dark disabled:opacity-40"
        >
          <SendHorizonal className="h-4.5 w-4.5" />
        </button>
      </form>
    </div>
  );
}
