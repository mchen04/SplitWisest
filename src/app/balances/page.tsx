"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageSquare, UserPlus, HandCoins, Scale } from "lucide-react";
import { api, ApiClientError, fmtMoney, todayStr, useMe, useSync, CURRENCIES } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, CardHeader, EmptyState, Button, Avatar, Modal, Field, Input, Select, ErrorNote } from "@/components/ui";

interface Friend {
  id: number;
  displayName: string;
  username: string;
  netByCurrency: Record<string, number>;
}

export default function BalancesPage() {
  const me = useMe();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState("");
  const [settleFriend, setSettleFriend] = useState<Friend | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ friends: Friend[]; myInviteCode: string }>("/api/friends")
      .then((r) => { setFriends(r.friends); setInviteCode(r.myInviteCode); })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useSync(load);

  async function addFriend(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api("/api/friends", { body: { code } });
      setAddOpen(false); setCode("");
      load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not add friend");
    } finally {
      setBusy(false);
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <AppShell>
      <PageTitle
        title="Balances"
        subtitle="Every friend relationship and what should happen next."
        action={
          <Button onClick={() => { setAddOpen(true); setError(null); }}>
            <UserPlus className="h-4 w-4" /> Add friend
          </Button>
        }
      />

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Your invite code</p>
          <p className="text-sm text-ink-faint">Friends sign up or add you with this code.</p>
        </div>
        <button
          onClick={copyInvite}
          className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm font-semibold hover:border-accent"
          aria-label="Copy invite code"
        >
          {inviteCode || "········"}
          {copied ? <Check className="h-4 w-4 text-owed" /> : <Copy className="h-4 w-4 text-ink-faint" />}
        </button>
      </Card>

      <Card>
        <CardHeader title="Friends" />
        {friends === null ? (
          <div className="space-y-3 p-4">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : friends.length === 0 ? (
          <EmptyState
            icon={<Scale className="h-8 w-8" />}
            title="No friends yet"
            hint="Share your invite code, or add a friend with theirs."
            action={<Button variant="secondary" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add friend</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {friends.map((f) => {
              const entries = Object.entries(f.netByCurrency);
              return (
                <li key={f.id} className="flex min-h-16 flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={f.displayName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.displayName}</p>
                    <p className="text-xs text-ink-faint">@{f.username}</p>
                  </div>
                  <div className="text-right text-sm">
                    {entries.length === 0 ? (
                      <span className="text-ink-faint">settled up</span>
                    ) : (
                      entries.map(([cur, amt]) => (
                        <p key={cur} className={amt > 0 ? "text-owed" : "text-owe"}>
                          {amt > 0 ? "owes you" : "you owe"}{" "}
                          <span className="tnum font-semibold">{fmtMoney(Math.abs(amt), cur)}</span>
                        </p>
                      ))
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    {entries.length > 0 && (
                      <Button variant="secondary" className="!min-h-9 !px-2.5" onClick={() => setSettleFriend(f)} title="Record offline payment">
                        <HandCoins className="h-4 w-4" />
                        <span className="hidden sm:inline">Settle</span>
                      </Button>
                    )}
                    <Link href={`/chat/${f.id}`}>
                      <Button variant="secondary" className="!min-h-9 !px-2.5" title={`Chat with ${f.displayName}`}>
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Chat</span>
                      </Button>
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a friend">
        <form onSubmit={addFriend} className="space-y-4">
          <Field label="Friend's invite code">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" busy={busy}>Add friend</Button>
          </div>
        </form>
      </Modal>

      {me && (
        <DirectSettleModal
          friend={settleFriend}
          meId={me.id}
          onClose={() => setSettleFriend(null)}
          onSaved={load}
        />
      )}
    </AppShell>
  );
}

function DirectSettleModal({
  friend, meId, onClose, onSaved,
}: {
  friend: Friend | null; meId: number; onClose: () => void; onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"i-paid" | "they-paid">("i-paid");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!friend) return;
    const entries = Object.entries(friend.netByCurrency);
    const [cur, amt] = entries[0] ?? ["USD", 0];
    setCurrency(cur);
    setAmount(amt !== 0 ? (Math.abs(amt) / 100).toFixed(2) : "");
    setDirection(amt < 0 ? "i-paid" : "they-paid");
    setDate(todayStr()); setNote(""); setError(null); setBusy(false);
  }, [friend]);

  if (!friend) return null;
  void meId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    setBusy(true);
    try {
      await api("/api/settlements", {
        body: { friendId: friend!.id, direction, amountCents, currency, date, note },
      });
      onSaved(); onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not record settlement");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Settle with ${friend.displayName}`}>
      <p className="mb-4 rounded-lg bg-paper px-3 py-2 text-xs text-ink-soft">
        Records an offline payment between just the two of you (outside any group).
      </p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Direction">
          <Select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)}>
            <option value="i-paid">I paid {friend.displayName}</option>
            <option value="they-paid">{friend.displayName} paid me</option>
          </Select>
        </Field>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Amount">
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" />
          </Field>
          <Field label="Currency">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-24">
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Venmo'd you back" />
        </Field>
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Record payment</Button>
        </div>
      </form>
    </Modal>
  );
}
