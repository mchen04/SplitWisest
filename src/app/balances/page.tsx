"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageSquare, UserPlus, UserMinus, HandCoins, Scale, Receipt, Bell, X } from "lucide-react";
import { api, ApiClientError, fmtMoney, fmtTime, todayStr, useApiData, useFormState, useMe } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, CardHeader, EmptyState, Button, Avatar, Modal, Field, Input, Select, ErrorNote } from "@/components/ui";
import { SettleFields } from "@/components/settle-fields";
import { DirectPaymentsModal } from "@/components/direct-payments-modal";

interface Friend {
  id: number;
  displayName: string;
  username: string;
  netByCurrency: Record<string, number>;
}

interface FriendRequest {
  id: number;
  userId: number;
  displayName: string;
  username: string;
  createdAt: string;
}

interface Nudge {
  id: number;
  fromName: string;
  groupName: string | null;
  note: string;
  seen: boolean;
  createdAt: string;
}

export default function BalancesPage() {
  const { data, reload } = useApiData<{
    friends: Friend[];
    incomingRequests: FriendRequest[];
    outgoingRequests: FriendRequest[];
    myInviteCode: string;
  }>("/api/friends");
  const friends = data?.friends ?? null;
  const incomingRequests = data?.incomingRequests ?? [];
  const outgoingRequests = data?.outgoingRequests ?? [];
  const inviteCode = data?.myInviteCode ?? "";
  const [copied, setCopied] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addNote, setAddNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [settleFriend, setSettleFriend] = useState<Friend | null>(null);
  const [historyFriend, setHistoryFriend] = useState<Friend | null>(null);
  const [nudgedId, setNudgedId] = useState<number | null>(null);
  const me = useMe();
  const { error, setError, busy, run } = useFormState();

  const { data: nudgeData, reload: reloadNudges } =
    useApiData<{ nudges: Nudge[] }>("/api/nudges");
  const reminders = (nudgeData?.nudges ?? []).filter((n) => !n.seen);

  async function nudge(f: Friend) {
    try {
      await api("/api/nudges", { body: { toId: f.id } });
      setNudgedId(f.id);
      setTimeout(() => setNudgedId((v) => (v === f.id ? null : v)), 2000);
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : "Could not send nudge");
    }
  }

  async function dismissReminder(id: number) {
    try {
      await api(`/api/nudges/${id}`, { method: "DELETE" });
      reloadNudges();
    } catch {
      // ignore
    }
  }

  function addFriend(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api<{ status: string; displayName: string }>("/api/friends", { body: { code } });
      setCode(""); setAddOpen(false);
      setAddNote(
        r.status === "accepted"
          ? `You and ${r.displayName} are now friends.`
          : `Friend request sent to ${r.displayName}.`
      );
      setTimeout(() => setAddNote(null), 4000);
      reload();
    }, "Could not add friend");
  }

  async function respondRequest(id: number, action: "accept" | "decline" | "cancel") {
    try {
      await api("/api/friends/requests", { body: { requestId: id, action } });
      reload();
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : "Could not update request");
    }
  }

  function copyInvite() {
    navigator.clipboard.writeText(inviteCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function removeFriend(f: Friend) {
    if (!window.confirm(`Remove ${f.displayName} from your friends? You'll need an invite code to reconnect.`)) return;
    try {
      await api("/api/friends", { method: "DELETE", body: { friendId: f.id } });
      reload();
    } catch (err) {
      window.alert(err instanceof ApiClientError ? err.message : "Could not remove friend");
    }
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

      <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:shrink-0">
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

      {addNote && (
        <div className="mb-4 rounded-lg bg-owed-soft px-3 py-2 text-sm text-owed md:shrink-0">{addNote}</div>
      )}

      {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
        <Card className="mb-4 md:shrink-0">
          <CardHeader title={<span className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-accent" /> Friend requests</span>} />
          <ul className="divide-y divide-line">
            {incomingRequests.map((r) => (
              <li key={`in-${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={r.displayName} size="sm" />
                <span className="min-w-0 flex-1 text-sm">
                  <strong>{r.displayName}</strong> <span className="text-ink-faint">@{r.username}</span> wants to be friends
                </span>
                <div className="flex gap-1.5">
                  <Button className="!min-h-9 !px-3" onClick={() => respondRequest(r.id, "accept")}>Accept</Button>
                  <Button variant="secondary" className="!min-h-9 !px-3" onClick={() => respondRequest(r.id, "decline")}>Decline</Button>
                </div>
              </li>
            ))}
            {outgoingRequests.map((r) => (
              <li key={`out-${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Avatar name={r.displayName} size="sm" />
                <span className="min-w-0 flex-1 text-sm">
                  Request sent to <strong>{r.displayName}</strong> <span className="text-ink-faint">@{r.username}</span>
                </span>
                <Button variant="secondary" className="!min-h-9 !px-3" onClick={() => respondRequest(r.id, "cancel")}>Cancel</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {reminders.length > 0 && (
        <Card className="mb-4 md:shrink-0">
          <CardHeader title={<span className="flex items-center gap-2"><Bell className="h-4 w-4 text-accent" /> Reminders</span>} />
          <ul className="divide-y divide-line">
            {reminders.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block">
                    <strong>{n.fromName}</strong> nudged you to settle up
                    {n.groupName ? <span className="text-ink-faint"> in {n.groupName}</span> : ""}.
                  </span>
                  {n.note && <span className="block text-xs text-ink-soft">“{n.note}”</span>}
                  <span className="block text-xs text-ink-faint">{fmtTime(n.createdAt)}</span>
                </span>
                <button
                  onClick={() => dismissReminder(n.id)}
                  aria-label="Dismiss reminder"
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-accent-soft hover:text-accent-dark"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="flex flex-col md:min-h-0 md:flex-1">
        <CardHeader title="Friends" />
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
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
                    {entries.some(([, amt]) => amt > 0) && (
                      <Button
                        variant="secondary"
                        className="!min-h-9 !px-2.5"
                        onClick={() => nudge(f)}
                        title={`Nudge ${f.displayName} to settle up`}
                        aria-label={`Nudge ${f.displayName}`}
                      >
                        {nudgedId === f.id ? <Check className="h-4 w-4 text-owed" /> : <Bell className="h-4 w-4" />}
                        <span className="hidden sm:inline">{nudgedId === f.id ? "Nudged" : "Nudge"}</span>
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      className="!min-h-9 !px-2.5"
                      onClick={() => setHistoryFriend(f)}
                      title={`Recorded payments with ${f.displayName}`}
                      aria-label={`Payments with ${f.displayName}`}
                    >
                      <Receipt className="h-4 w-4" />
                    </Button>
                    <Link href={`/chat/${f.id}`}>
                      <Button variant="secondary" className="!min-h-9 !px-2.5" title={`Chat with ${f.displayName}`}>
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Chat</span>
                      </Button>
                    </Link>
                    <Button
                      variant="secondary"
                      className="!min-h-9 !px-2.5"
                      onClick={() => removeFriend(f)}
                      title={`Remove ${f.displayName}`}
                      aria-label={`Remove ${f.displayName}`}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a friend">
        <form onSubmit={addFriend} className="space-y-4">
          <Field label="Friend's invite code" hint="We'll send them a request — you become friends once they accept.">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" busy={busy}>Send request</Button>
          </div>
        </form>
      </Modal>

      <DirectSettleModal
        friend={settleFriend}
        onClose={() => setSettleFriend(null)}
        onSaved={reload}
      />

      {me && (
        <DirectPaymentsModal
          friend={historyFriend}
          meId={me.id}
          meName={me.displayName}
          onClose={() => setHistoryFriend(null)}
          onChanged={reload}
        />
      )}
    </AppShell>
  );
}

function DirectSettleModal({
  friend, onClose, onSaved,
}: {
  friend: Friend | null; onClose: () => void; onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"i-paid" | "they-paid">("i-paid");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const { error, setError, busy, run } = useFormState();

  useEffect(() => {
    if (!friend) return;
    const entries = Object.entries(friend.netByCurrency);
    const [cur, amt] = entries[0] ?? ["USD", 0];
    setCurrency(cur);
    setAmount(amt !== 0 ? (Math.abs(amt) / 100).toFixed(2) : "");
    setDirection(amt < 0 ? "i-paid" : "they-paid");
    setDate(todayStr()); setNote("");
    setError(null);
    // setError is stable; reset only when the target friend changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friend]);

  if (!friend) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount || "0") * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) return setError("Enter a positive amount");
    run(async () => {
      await api("/api/settlements", {
        body: { friendId: friend!.id, direction, amountCents, currency, date, note },
      });
      onSaved(); onClose();
    }, "Could not record settlement");
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
        <SettleFields
          amount={amount} setAmount={setAmount}
          currency={currency} setCurrency={setCurrency}
          date={date} setDate={setDate}
          note={note} setNote={setNote}
          notePlaceholder="Venmo'd you back"
        />
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" busy={busy}>Record payment</Button>
        </div>
      </form>
    </Modal>
  );
}
