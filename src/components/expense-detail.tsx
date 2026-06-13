"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Pencil, Trash2, Paperclip, FileText, SendHorizonal, MessageSquare } from "lucide-react";
import { api, fmtDate, fmtMoney, fmtTime } from "@/lib/client";
import { Modal, Button, Avatar, Input } from "./ui";

interface Detail {
  id: number;
  title: string;
  amountCents: number;
  currency: string;
  date: string;
  payerId: number;
  notes: string;
  splitMethod: string;
  updatedAt: string;
  shares: { userId: number; shareCents: number; displayName: string }[];
  items: { id: number; name: string; amountCents: number; participantIds: number[] }[];
  attachments: { id: number; filename: string; mime: string }[];
}

interface Comment {
  id: number;
  authorId: number;
  authorName: string;
  body: string;
  createdAt: string;
}

const METHOD_LABEL: Record<string, string> = {
  equal: "Split equally",
  exact: "Exact amounts",
  percentage: "By percentage",
  shares: "By shares",
  itemized: "Itemized",
};

export function ExpenseDetailModal({
  expenseId,
  meId,
  open,
  onClose,
  onEdit,
  onDelete,
}: {
  expenseId: number | null;
  meId: number;
  open: boolean;
  onClose: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const commentsEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || expenseId === null) return;
    // Clear stale detail before loading the selected expense.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetail(null);
    setComments(null);
    setDraft("");
    api<{ expense: Detail }>(`/api/expenses/${expenseId}`).then((r) => setDetail(r.expense)).catch(() => {});
    api<{ comments: Comment[] }>(`/api/expenses/${expenseId}/comments`).then((r) => setComments(r.comments)).catch(() => {});
  }, [open, expenseId]);

  useEffect(() => {
    commentsEnd.current?.scrollIntoView({ block: "nearest" });
  }, [comments?.length]);

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending || expenseId === null) return;
    setSending(true);
    try {
      const r = await api<{ comment: Comment }>(`/api/expenses/${expenseId}/comments`, { body: { body } });
      setComments((c) => [...(c ?? []), r.comment]);
      setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={detail?.title ?? "Expense"} wide>
      {!detail ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
      ) : (
        <div className="space-y-5">
          {/* Header summary */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-2xl font-bold tnum">{fmtMoney(detail.amountCents, detail.currency)}</p>
            <p className="text-sm text-ink-soft">{fmtDate(detail.date)} · {METHOD_LABEL[detail.splitMethod] ?? detail.splitMethod}</p>
          </div>
          <p className="text-sm text-ink-soft">
            Paid by{" "}
            <Link href={`/people/${detail.payerId}`} className="font-semibold hover:text-accent-dark hover:underline">
              {detail.shares.find((s) => s.userId === detail.payerId)?.displayName
                ?? (detail.payerId === meId ? "you" : "a member")}
            </Link>
          </p>

          {/* Split breakdown */}
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Split breakdown</p>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {detail.shares.map((s) => (
                <li key={s.userId} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                  <Link href={`/people/${s.userId}`} aria-label={`Open ${s.displayName}'s profile`}>
                    <Avatar name={s.displayName} size="sm" />
                  </Link>
                  <span className="min-w-0 flex-1 truncate">
                    <Link href={`/people/${s.userId}`} className="hover:text-accent-dark hover:underline">
                      {s.displayName}{s.userId === meId ? " (you)" : ""}
                    </Link>
                  </span>
                  <span className="tnum font-medium">{fmtMoney(s.shareCents, detail.currency)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Itemized lines */}
          {detail.items.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Items</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {detail.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {i.name}
                      <span className="text-ink-faint"> · {i.participantIds.length} {i.participantIds.length === 1 ? "person" : "people"}</span>
                    </span>
                    <span className="tnum font-medium">{fmtMoney(i.amountCents, detail.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Notes */}
          {detail.notes.trim() && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">Notes</p>
              <p className="whitespace-pre-wrap rounded-lg bg-subtle px-3 py-2 text-sm text-ink-soft">{detail.notes}</p>
            </div>
          )}

          {/* Receipts */}
          {detail.attachments.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <Paperclip className="h-3.5 w-3.5" /> Receipts
              </p>
              <div className="flex flex-wrap gap-3">
                {detail.attachments.map((a) =>
                  a.mime.startsWith("image/") ? (
                    <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/attachments/${a.id}`}
                        alt={a.filename}
                        className="max-h-56 rounded-lg border border-line object-contain"
                      />
                    </a>
                  ) : (
                    <a
                      key={a.id}
                      href={`/api/attachments/${a.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:border-accent"
                    >
                      <FileText className="h-4 w-4" /> {a.filename}
                    </a>
                  )
                )}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <MessageSquare className="h-3.5 w-3.5" /> Comments
            </p>
            {comments === null ? (
              <div className="skeleton h-8 w-2/3" />
            ) : comments.length === 0 ? (
              <p className="text-sm text-ink-faint">No comments yet. Start the discussion.</p>
            ) : (
              <ul className="space-y-2.5">
                {comments.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5">
                    <Link href={`/people/${c.authorId}`} aria-label={`Open ${c.authorName}'s profile`}>
                      <Avatar name={c.authorName} size="sm" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <Link href={`/people/${c.authorId}`} className="font-medium hover:text-accent-dark hover:underline">
                          {c.authorId === meId ? "You" : c.authorName}
                        </Link>{" "}
                        <span className="text-xs text-ink-faint">{fmtTime(c.createdAt)}</span>
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{c.body}</p>
                    </div>
                  </li>
                ))}
                <div ref={commentsEnd} />
              </ul>
            )}
            <form onSubmit={sendComment} className="mt-3 flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                aria-label="Add a comment"
                maxLength={2000}
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                aria-label="Post comment"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-on-accent transition-colors hover:bg-accent-dark disabled:opacity-40"
              >
                <SendHorizonal className="h-4.5 w-4.5" />
              </button>
            </form>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => onEdit(detail.id)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button variant="danger" onClick={() => onDelete(detail.id)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
