"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, MessageSquare, UserPlus, UserMinus, HandCoins, Scale, Receipt, Bell, X, Search, UserRound } from "lucide-react";
import { api, ApiClientError, fmtMoney, fmtTime, useApiData, useFormState, useMe } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, CardHeader, EmptyState, Button, Avatar, Modal, Field, Input, ErrorNote, Menu, MenuItem } from "@/components/ui";
import { DirectPaymentsModal } from "@/components/direct-payments-modal";
import { DirectSettleModal } from "@/components/direct-settle-modal";
import type { FriendObligation } from "@/lib/balances";

interface Friend {
  id: number;
  displayName: string;
  username: string;
  obligations: FriendObligation[];
  netByCurrency: Record<string, number>;
  canRemoveFriend: boolean;
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
  const { data, error: friendsError, reload } = useApiData<{
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
  const [settleChoice, setSettleChoice] = useState<{ friendId: number; preferredSign: -1 | 1 } | null>(null);
  const [historyFriend, setHistoryFriend] = useState<Friend | null>(null);
  const [nudgedId, setNudgedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const me = useMe();
  const { error, setError, busy, run } = useFormState();

  const { data: nudgeData, reload: reloadNudges } =
    useApiData<{ nudges: Nudge[] }>("/api/nudges");
  const reminders = (nudgeData?.nudges ?? []).filter((n) => !n.seen);
  const filteredFriends = (friends ?? []).filter((f) => {
    const q = query.trim().toLowerCase();
    return !q || f.displayName.toLowerCase().includes(q) || f.username.toLowerCase().includes(q);
  });
  const activeFriends = filteredFriends.filter((f) => f.obligations.length > 0);
  const settledFriends = filteredFriends.filter((f) => f.obligations.length === 0);
  const settleFriend = friends?.find((friend) => friend.id === settleChoice?.friendId) ?? null;

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

  function copyInviteLink() {
    const link = `${window.location.origin}/signup?invite=${inviteCode}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
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
    <AppShell title="Balances">
      {/* Invite — a shareable link, never a raw code on screen. */}
      <Card className="mb-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 md:shrink-0">
        <p className="text-sm font-medium">Invite a friend</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={copyInviteLink} disabled={!inviteCode}>
            {copied ? <><Check className="h-4 w-4 text-owed" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}
          </Button>
          <Button onClick={() => { setAddOpen(true); setError(null); }}>
            <UserPlus className="h-4 w-4" /> Add friend
          </Button>
        </div>
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
                <Link href={`/people/${r.userId}`} aria-label={`Open ${r.displayName}'s profile`}>
                  <Avatar name={r.displayName} size="sm" />
                </Link>
                <span className="min-w-0 flex-1 text-sm">
                  <Link href={`/people/${r.userId}`} className="font-semibold hover:text-accent-dark hover:underline">
                    {r.displayName}
                  </Link>{" "}
                  <span className="text-ink-faint">@{r.username}</span> wants to be friends
                </span>
                <div className="flex gap-1.5">
                  <Button onClick={() => respondRequest(r.id, "accept")}>Accept</Button>
                  <Button variant="secondary" onClick={() => respondRequest(r.id, "decline")}>Decline</Button>
                </div>
              </li>
            ))}
            {outgoingRequests.map((r) => (
              <li key={`out-${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <Link href={`/people/${r.userId}`} aria-label={`Open ${r.displayName}'s profile`}>
                  <Avatar name={r.displayName} size="sm" />
                </Link>
                <span className="min-w-0 flex-1 text-sm">
                  Request sent to{" "}
                  <Link href={`/people/${r.userId}`} className="font-semibold hover:text-accent-dark hover:underline">
                    {r.displayName}
                  </Link>{" "}
                  <span className="text-ink-faint">@{r.username}</span>
                </span>
                <Button variant="secondary" onClick={() => respondRequest(r.id, "cancel")}>Cancel</Button>
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
                  className="rounded-lg p-1.5 text-ink-faint hover:bg-subtle hover:text-ink"
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
        <div className="border-b border-line p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends"
              aria-label="Search friends"
              className="pl-8"
            />
          </div>
        </div>
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {friendsError && friends === null ? (
          <EmptyState
            icon={<Scale className="h-7 w-7" />}
            title="Could not load friends"
            hint={friendsError}
            action={<Button variant="secondary" onClick={reload}>Retry</Button>}
          />
        ) : friends === null ? (
          <div className="space-y-2 p-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : friends.length === 0 ? (
          <EmptyState
            icon={<Scale className="h-7 w-7" />}
            title="No friends yet"
            hint="Copy your invite link, or add a friend with their code."
            action={<Button variant="secondary" onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add friend</Button>}
          />
        ) : filteredFriends.length === 0 ? (
          <EmptyState
            icon={<Search className="h-7 w-7" />}
            title="No matching friends"
            hint="Try a different name or username."
          />
        ) : (
          <div>
            <FriendSection
              title="Active balances"
              friends={activeFriends}
              nudgedId={nudgedId}
              onSettle={(friend, preferredSign) => setSettleChoice({ friendId: friend.id, preferredSign })}
              onHistory={setHistoryFriend}
              onNudge={nudge}
              onRemove={removeFriend}
            />
            <FriendSection
              title="Settled up"
              friends={settledFriends}
              nudgedId={nudgedId}
              onSettle={(friend, preferredSign) => setSettleChoice({ friendId: friend.id, preferredSign })}
              onHistory={setHistoryFriend}
              onNudge={nudge}
              onRemove={removeFriend}
            />
          </div>
        )}
        </div>
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a friend">
        <form onSubmit={addFriend} className="space-y-4">
          <Field label="Friend's invite code">
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
        preferredSign={settleChoice?.preferredSign}
        onClose={() => setSettleChoice(null)}
        onSaved={reload}
      />

      {me && (
        <DirectPaymentsModal
          friend={historyFriend}
          meId={me.id}
          onClose={() => setHistoryFriend(null)}
          onChanged={reload}
        />
      )}
    </AppShell>
  );
}

function FriendSection({
  title,
  friends,
  nudgedId,
  onSettle,
  onHistory,
  onNudge,
  onRemove,
}: {
  title: string;
  friends: Friend[];
  nudgedId: number | null;
  onSettle: (friend: Friend, preferredSign: -1 | 1) => void;
  onHistory: (friend: Friend) => void;
  onNudge: (friend: Friend) => void;
  onRemove: (friend: Friend) => void;
}) {
  if (friends.length === 0) return null;
  return (
    <section>
      <div className="border-b border-line bg-subtle px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </div>
      <ul className="divide-y divide-line">
        {friends.map((f) => {
          const entries = f.obligations;
          const theyOweMe = entries.some((item) => item.netCents > 0);
          const iOweThem = entries.some((item) => item.netCents < 0);
          const hasBalance = entries.length > 0;
          return (
            <li key={f.id} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2.5 hover:bg-subtle">
              <Link href={`/people/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Open ${f.displayName}'s profile`}>
                <Avatar name={f.displayName} />
                <div className="min-w-0">
                  <span className="block truncate font-medium">{f.displayName}</span>
                  <span className="hidden text-xs text-ink-faint sm:block">@{f.username}</span>
                  {/* Mobile: balance lives under the name (the right column is hidden). */}
                  <span className="block text-xs sm:hidden">
                    {!hasBalance ? (
                      <span className="text-ink-faint">settled up</span>
                    ) : (
                      entries.map((item, index) => (
                        <span key={`${item.groupId ?? "direct"}:${item.currency}:${index}`} className={`block ${item.netCents > 0 ? "text-owed" : "text-owe"}`}>
                          {item.groupName ? `${item.groupName}: ` : "Direct: "}{item.netCents > 0 ? "owes you " : "you owe "}
                          <span className="tnum font-semibold">{fmtMoney(Math.abs(item.netCents), item.currency)}</span>
                        </span>
                      ))
                    )}
                  </span>
                </div>
              </Link>
              <div className="hidden text-right text-sm sm:block">
                {!hasBalance ? (
                  <span className="text-ink-faint">settled up</span>
                ) : (
                  entries.map((item, index) => (
                    <p key={`${item.groupId ?? "direct"}:${item.currency}:${index}`} className={item.netCents > 0 ? "text-owed" : "text-owe"}>
                      <span className="text-xs text-ink-faint">{item.groupName ?? "Direct"} · </span>
                      {item.netCents > 0 ? "owes you" : "you owe"}{" "}
                      <span className="tnum font-semibold">{fmtMoney(Math.abs(item.netCents), item.currency)}</span>
                    </p>
                  ))
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {theyOweMe ? (
                  <Button variant="secondary" onClick={() => onNudge(f)} aria-label={`Remind ${f.displayName} to settle up`}>
                    {nudgedId === f.id ? <><Check className="h-4 w-4 text-owed" /> Reminded</> : <><Bell className="h-4 w-4" /> Remind</>}
                  </Button>
                ) : iOweThem ? (
                  <Button variant="secondary" onClick={() => onSettle(f, -1)}>
                    <HandCoins className="h-4 w-4" /> Settle up
                  </Button>
                ) : null}
                <Menu label={`More actions for ${f.displayName}`}>
                  {hasBalance && theyOweMe && (
                    <MenuItem icon={<HandCoins className="h-4 w-4" />} onClick={() => onSettle(f, 1)}>Record incoming payment</MenuItem>
                  )}
                  <MenuItem icon={<UserRound className="h-4 w-4" />} onClick={() => { window.location.href = `/people/${f.id}`; }}>View profile</MenuItem>
                  <MenuItem icon={<Receipt className="h-4 w-4" />} onClick={() => onHistory(f)}>Payment history</MenuItem>
                  <MenuItem icon={<MessageSquare className="h-4 w-4" />} onClick={() => { window.location.href = `/chat?dm=${f.id}`; }}>Chat</MenuItem>
                  {f.canRemoveFriend && (
                    <MenuItem icon={<UserMinus className="h-4 w-4" />} danger onClick={() => onRemove(f)}>Remove friend</MenuItem>
                  )}
                </Menu>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
