"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bell, HandCoins, MessageSquare, Receipt, Search, UserMinus, UserPlus, Users, X,
} from "lucide-react";
import { api, ApiClientError, fmtDate, fmtMoney, useApiData, useMe } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Avatar, Button, Card, CardHeader, EmptyState, Input } from "@/components/ui";
import { DirectPaymentsModal } from "@/components/direct-payments-modal";
import { DirectSettleModal } from "@/components/direct-settle-modal";
import type { PersonProfile } from "@/lib/people";

const relationshipLabel: Record<PersonProfile["relationship"], string> = {
  self: "You",
  friend: "Friend",
  "shared-group": "Shared group member",
  pending: "Pending request",
  none: "Not available",
};

export default function PersonPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const me = useMe();
  const { data, error: profileError, status: profileStatus, reload } = useApiData<{ profile: PersonProfile }>(`/api/people/${userId}`);
  const [settleOpen, setSettleOpen] = useState(false);
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");

  const profile = data?.profile ?? null;

  async function sendFriendRequest() {
    if (!profile) return;
    setActionNote(null);
    try {
      await api("/api/friends", { body: { userId: profile.person.id } });
      setActionNote(`Friend request sent to ${profile.person.displayName}.`);
      reload();
    } catch {
      setActionNote("Could not send friend request.");
    }
  }

  async function respondRequest(action: "accept" | "decline" | "cancel") {
    if (!profile?.request) return;
    try {
      await api("/api/friends/requests", { body: { requestId: profile.request.id, action } });
      reload();
    } catch (err) {
      setActionNote(err instanceof ApiClientError ? err.message : "Could not update request");
    }
  }

  async function nudge() {
    if (!profile) return;
    try {
      await api("/api/nudges", { body: { toId: profile.person.id, groupId: profile.canChat ? null : profile.sharedGroups[0]?.id ?? null } });
      setActionNote(`Nudged ${profile.person.displayName}.`);
    } catch (err) {
      setActionNote(err instanceof ApiClientError ? err.message : "Could not send nudge");
    }
  }

  async function removeFriend() {
    if (!profile || !window.confirm(`Remove ${profile.person.displayName} from your friends?`)) return;
    try {
      await api("/api/friends", { method: "DELETE", body: { friendId: profile.person.id } });
      reload();
    } catch (err) {
      setActionNote(err instanceof ApiClientError ? err.message : "Could not remove friend");
    }
  }

  if (profileStatus === 404) {
    return (
      <AppShell>
        <Card>
          <EmptyState
            title="Profile not available"
            hint="You can only view yourself, friends, pending requests, and people who share a group with you."
            action={<Link href="/balances"><Button variant="secondary"><ArrowLeft className="h-4 w-4" /> Balances</Button></Link>}
          />
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {profile ? (
        <>
          <PageTitle
            title={profile.person.displayName}
            subtitle={`@${profile.person.username} · ${relationshipLabel[profile.relationship]}`}
            action={<ProfileActions profile={profile} onSettle={() => setSettleOpen(true)} onPayments={() => setPaymentsOpen(true)} onNudge={nudge} onRemove={removeFriend} onRequest={sendFriendRequest} />}
          />

          {actionNote && <div className="mb-4 rounded-lg bg-paper px-3 py-2 text-sm text-ink-soft">{actionNote}</div>}

          {profile.request && (
            <Card className="mb-4 px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <UserPlus className="h-4 w-4 text-accent" />
                <p className="min-w-0 flex-1 text-sm">
                  {profile.request.direction === "incoming"
                    ? `${profile.person.displayName} sent you a friend request.`
                    : `Your friend request is pending.`}
                </p>
                {profile.request.direction === "incoming" ? (
                  <>
                    <Button className="!min-h-9 !px-3" onClick={() => respondRequest("accept")}>Accept</Button>
                    <Button variant="secondary" className="!min-h-9 !px-3" onClick={() => respondRequest("decline")}>Decline</Button>
                  </>
                ) : (
                  <Button variant="secondary" className="!min-h-9 !px-3" onClick={() => respondRequest("cancel")}>Cancel</Button>
                )}
              </div>
            </Card>
          )}

          <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
            <div className="space-y-4 md:min-h-0 md:overflow-y-auto">
              <Card>
                <CardHeader title="Shared history" />
                <div className="border-b border-line p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                    <Input
                      value={historyQuery}
                      onChange={(e) => setHistoryQuery(e.target.value)}
                      placeholder="Search expenses and payments"
                      aria-label="Search shared history"
                      className="pl-8 pr-9"
                    />
                    {historyQuery && (
                      <button
                        type="button"
                        onClick={() => setHistoryQuery("")}
                        aria-label="Clear shared history search"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-faint hover:bg-accent-soft hover:text-accent-dark"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <HistoryList profile={profile} meId={me?.id ?? 0} query={historyQuery} />
              </Card>
            </div>
            <aside className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={profile.person.displayName} size="lg" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{profile.person.displayName}</p>
                    <p className="truncate text-sm text-ink-faint">@{profile.person.username}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {Object.entries(profile.netByCurrency).length === 0 ? (
                    <p className="text-sm text-ink-faint">No open pairwise balance.</p>
                  ) : Object.entries(profile.netByCurrency).map(([cur, amt]) => (
                    <p key={cur} className={`text-sm ${amt > 0 ? "text-owed" : "text-owe"}`}>
                      {amt > 0 ? "Owes you" : "You owe"} <strong>{fmtMoney(Math.abs(amt), cur)}</strong>
                    </p>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> Shared groups</span>} />
                {profile.sharedGroups.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-ink-faint">No shared groups.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {profile.sharedGroups.map((g) => (
                      <li key={g.id}>
                        <Link href={`/groups/${g.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-paper">
                          <span className="truncate font-medium">{g.name}</span>
                          <span className="text-xs text-ink-faint">{g.currency}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </aside>
          </div>

          <DirectSettleModal
            friend={settleOpen ? {
              id: profile.person.id,
              displayName: profile.person.displayName,
              netByCurrency: profile.netByCurrency,
            } : null}
            onClose={() => setSettleOpen(false)}
            onSaved={reload}
          />
          {me && (
            <DirectPaymentsModal
              friend={paymentsOpen ? { id: profile.person.id, displayName: profile.person.displayName } : null}
              meId={me.id}
              onClose={() => setPaymentsOpen(false)}
              onChanged={reload}
            />
          )}
        </>
      ) : (
        <div className="space-y-4">
          {profileError ? (
            <Card>
              <EmptyState
                title="Could not load profile"
                hint={profileError}
                action={<Button variant="secondary" onClick={reload}>Retry</Button>}
              />
            </Card>
          ) : (
            <>
              <div className="skeleton h-16 w-full" />
              <div className="skeleton h-64 w-full" />
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}

function ProfileActions({
  profile, onSettle, onPayments, onNudge, onRemove, onRequest,
}: {
  profile: PersonProfile;
  onSettle: () => void;
  onPayments: () => void;
  onNudge: () => void;
  onRemove: () => void;
  onRequest: () => void;
}) {
  if (profile.relationship === "self") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {profile.canChat && (
        <Link href={`/chat/${profile.person.id}`}>
          <Button variant="secondary"><MessageSquare className="h-4 w-4" /> Chat</Button>
        </Link>
      )}
      {profile.canSettleDirectly && <Button variant="secondary" onClick={onSettle}><HandCoins className="h-4 w-4" /> Settle</Button>}
      {profile.canSettleDirectly && <Button variant="secondary" onClick={onPayments}><Receipt className="h-4 w-4" /> Payments</Button>}
      {profile.canNudge && <Button variant="secondary" onClick={onNudge}><Bell className="h-4 w-4" /> Nudge</Button>}
      {profile.canRequestFriend && <Button variant="secondary" onClick={onRequest}><UserPlus className="h-4 w-4" /> Add friend</Button>}
      {profile.canRemoveFriend && <Button variant="danger" onClick={onRemove}><UserMinus className="h-4 w-4" /> Remove</Button>}
    </div>
  );
}

function HistoryList({ profile, meId, query }: { profile: PersonProfile; meId: number; query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  const rows = [
    ...profile.recentExpenses.map((e) => ({ type: "expense" as const, key: `e-${e.id}`, date: e.date, item: e })),
    ...profile.recentPayments.map((p) => ({ type: "payment" as const, key: `p-${p.id}`, date: p.date, item: p })),
  ].filter((row) => {
    if (!normalizedQuery) return true;
    const text = row.type === "expense"
      ? `${row.item.title} ${row.item.groupName} ${row.item.payerName} ${row.item.currency}`
      : `${row.item.payerName} ${row.item.recipientName} ${row.item.groupName ?? "direct"} ${row.item.note} ${row.item.currency}`;
    return text.toLowerCase().includes(normalizedQuery);
  }).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 30);

  if (rows.length === 0 && !normalizedQuery) {
    return <EmptyState title="No shared history yet" hint="Shared expenses and recorded payments will appear here." />;
  }
  if (rows.length === 0) {
    return <EmptyState icon={<Search className="h-8 w-8" />} title="No matching history" hint="Try a different expense, group, person, note, or currency." />;
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => row.type === "expense" ? (
        <li key={row.key}>
          <Link href={`/groups/${row.item.groupId}?expense=${row.item.id}`} className="block px-4 py-3 hover:bg-paper">
            <div className="flex items-center gap-3">
              <Receipt className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{row.item.title}</span>
                <span className="block text-xs text-ink-faint">
                  {row.item.groupName} · paid by {row.item.payerId === meId ? "you" : row.item.payerName} · {fmtDate(row.item.date)}
                </span>
              </span>
              <span className="tnum text-sm font-semibold">{fmtMoney(row.item.amountCents, row.item.currency)}</span>
            </div>
          </Link>
        </li>
      ) : (
        <li key={row.key} className="px-4 py-3">
          <div className="flex items-center gap-3">
            <HandCoins className="h-4 w-4 shrink-0 text-owed" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm">
                <strong>{row.item.payerId === meId ? "You" : row.item.payerName}</strong> paid{" "}
                <strong>{row.item.recipientId === meId ? "you" : row.item.recipientName}</strong>
              </span>
              <span className="block text-xs text-ink-faint">
                {row.item.groupName ?? "Direct"} · {fmtDate(row.item.date)}{row.item.note ? ` · ${row.item.note}` : ""}
              </span>
            </span>
            <span className="tnum text-sm font-semibold">{fmtMoney(row.item.amountCents, row.item.currency)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
