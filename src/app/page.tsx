"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Users, ScrollText } from "lucide-react";
import { apiCached, cacheGet, fmtTime, useMe, useSync } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, CardHeader, Money, EmptyState, Button, Avatar } from "@/components/ui";

interface Group {
  id: number;
  name: string;
  currency: string;
  memberCount: number;
  expenseCount: number;
  myNetCents: number;
}

interface Friend {
  id: number;
  displayName: string;
  netByCurrency: Record<string, number>;
}

interface Activity {
  id: number;
  groupId: number | null;
  groupName: string | null;
  summary: string;
  createdAt: string;
}

export default function Dashboard() {
  const me = useMe();
  const [groups, setGroups] = useState<Group[] | null>(() => cacheGet<{ groups: Group[] }>("/api/groups")?.groups ?? null);
  const [friends, setFriends] = useState<Friend[] | null>(() => cacheGet<{ friends: Friend[] }>("/api/friends")?.friends ?? null);
  const [activity, setActivity] = useState<Activity[] | null>(() => cacheGet<{ activity: Activity[] }>("/api/activity")?.activity ?? null);

  const load = useCallback(() => {
    apiCached<{ groups: Group[] }>("/api/groups").then((r) => setGroups(r.groups)).catch(() => {});
    apiCached<{ friends: Friend[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => {});
    apiCached<{ activity: Activity[] }>("/api/activity").then((r) => setActivity(r.activity)).catch(() => {});
  }, []);

  useEffect(load, [load]);
  useSync(load);

  // Totals per currency across all friends
  const owedToMe: Record<string, number> = {};
  const iOwe: Record<string, number> = {};
  for (const f of friends ?? []) {
    for (const [cur, amt] of Object.entries(f.netByCurrency)) {
      if (amt > 0) owedToMe[cur] = (owedToMe[cur] ?? 0) + amt;
      else if (amt < 0) iOwe[cur] = (iOwe[cur] ?? 0) - amt;
    }
  }
  const netByCur: Record<string, number> = {};
  for (const [c, v] of Object.entries(owedToMe)) netByCur[c] = (netByCur[c] ?? 0) + v;
  for (const [c, v] of Object.entries(iOwe)) netByCur[c] = (netByCur[c] ?? 0) - v;

  return (
    <AppShell>
      <PageTitle
        title={me ? `Hey, ${me.displayName.split(" ")[0]}` : "Home"}
        subtitle="Here's where things stand with your friends."
        action={
          <Link href={groups && groups.length > 0 ? `/groups/${groups[0].id}?add=1` : "/groups"}>
            <Button>
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </Link>
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:shrink-0">
        <SummaryCard label="You are owed" entries={owedToMe} tone="owed" loading={friends === null} />
        <SummaryCard label="You owe" entries={iOwe} tone="owe" loading={friends === null} />
        <SummaryCard label="Net balance" entries={netByCur} tone="net" loading={friends === null} />
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-3 md:min-h-0 md:flex-1">
        <Card className="flex flex-col md:min-h-0">
          <CardHeader
            title="Your groups"
            action={
              <Link href="/groups" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                Manage <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {groups === null ? (
            <SkeletonRows n={3} />
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No groups yet"
              hint="Create a group for a trip, an apartment, or a dinner crew."
              action={
                <Link href="/groups">
                  <Button variant="secondary">Create a group</Button>
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link href={`/groups/${g.id}`} className="flex min-h-[var(--row-h)] items-center gap-2.5 px-3.5 py-1.5 hover:bg-paper">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{g.name}</span>
                      <span className="block text-xs text-ink-faint">
                        {g.memberCount} {g.memberCount === 1 ? "member" : "members"} · {g.expenseCount}{" "}
                        {g.expenseCount === 1 ? "expense" : "expenses"}
                      </span>
                    </span>
                    <span className="text-sm font-medium">
                      {g.myNetCents === 0 ? (
                        <span className="text-ink-faint">settled</span>
                      ) : (
                        <Money cents={g.myNetCents} currency={g.currency} signed />
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Card>

        <Card className="flex flex-col md:min-h-0">
          <CardHeader
            title="Friends"
            action={
              <Link href="/balances" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                Settle <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {friends === null ? (
            <SkeletonRows n={3} />
          ) : friends.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No friends yet"
              hint="Add friends from the Balances page to start splitting."
            />
          ) : (
            <ul className="divide-y divide-line">
              {friends.map((f) => {
                const nets = Object.entries(f.netByCurrency).filter(([, v]) => v !== 0);
                return (
                  <li key={f.id}>
                    <Link href="/balances" className="flex min-h-[var(--row-h)] items-center gap-2.5 px-3.5 py-1.5 hover:bg-paper">
                      <Avatar name={f.displayName} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.displayName}</span>
                      <span className="text-right text-sm font-medium">
                        {nets.length === 0 ? (
                          <span className="text-ink-faint">settled</span>
                        ) : (
                          nets.map(([cur, amt]) => (
                            <span key={cur} className="block">
                              <Money cents={amt} currency={cur} signed />
                            </span>
                          ))
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </Card>

        <Card className="flex flex-col md:min-h-0">
          <CardHeader title="Recent activity" />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {activity === null ? (
            <SkeletonRows n={4} />
          ) : activity.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-8 w-8" />}
              title="Nothing yet"
              hint="Expenses, settlements, and group changes will show up here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {activity.slice(0, 50).map((a) => (
                <li key={a.id} className="px-3.5 py-1.5">
                  <p className="text-sm leading-snug">{a.summary}</p>
                  <p className="text-xs text-ink-faint">
                    {a.groupName ? `${a.groupName} · ` : ""}
                    {fmtTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function SummaryCard({
  label,
  entries,
  tone,
  loading,
}: {
  label: string;
  entries: Record<string, number>;
  tone: "owed" | "owe" | "net";
  loading: boolean;
}) {
  const list = Object.entries(entries).filter(([, v]) => v !== 0);
  const color = tone === "owed" ? "text-owed" : tone === "owe" ? "text-owe" : "";
  return (
    <Card className="px-3.5 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</p>
      <div className="mt-0.5 min-h-7">
        {loading ? (
          <div className="skeleton h-6 w-24" />
        ) : list.length === 0 ? (
          <p className="font-display text-xl font-semibold text-ink-faint">All clear</p>
        ) : (
          list.map(([cur, amt]) => (
            <p key={cur} className={`font-display text-xl font-semibold ${tone === "net" ? (amt > 0 ? "text-owed" : amt < 0 ? "text-owe" : "") : color}`}>
              <Money cents={tone === "net" ? amt : Math.abs(amt)} currency={cur} signed={tone === "net"} />
            </p>
          ))
        )}
      </div>
    </Card>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-3 px-4 py-4">
      {[...Array(n)].map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}
