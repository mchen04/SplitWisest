"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Users, ScrollText, Bell, HandCoins } from "lucide-react";
import { apiCached, cacheGet, fmtMoney, fmtTime, useMe, useSync } from "@/lib/client";
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
  useSync((c, prev) => {
    if (
      c.activityCursor !== prev.activityCursor ||
      c.nudgeCursor !== prev.nudgeCursor ||
      c.requestCursor !== prev.requestCursor
    ) {
      load();
    }
  });

  // Net position per currency, plus the single most useful next step ("coach").
  const netByCur: Record<string, number> = {};
  let owedTotal = 0;
  let oweTotal = 0;
  let topCreditor: { f: Friend; cur: string; amt: number } | null = null; // they owe me
  let topDebt: { f: Friend; cur: string; amt: number } | null = null; // I owe them
  for (const f of friends ?? []) {
    for (const [cur, amt] of Object.entries(f.netByCurrency)) {
      netByCur[cur] = (netByCur[cur] ?? 0) + amt;
      if (amt > 0) {
        owedTotal += amt;
        if (!topCreditor || amt > topCreditor.amt) topCreditor = { f, cur, amt };
      } else if (amt < 0) {
        oweTotal += -amt;
        if (!topDebt || amt < topDebt.amt) topDebt = { f, cur, amt };
      }
    }
  }
  const currencies = Object.entries(netByCur).filter(([, v]) => v !== 0);
  const singleCur = Object.keys(netByCur).length === 1 ? Object.keys(netByCur)[0] : null;
  const addExpenseHref = groups && groups.length > 0 ? `/groups/${groups[0].id}?add=1` : "/groups";
  const activityPeek = (activity ?? []).filter((a) => !/joined the group|are now friends|created the group|joined SplitWisest/i.test(a.summary));

  return (
    <AppShell>
      <PageTitle
        title={me ? `Hey, ${me.displayName.split(" ")[0]}` : "Home"}
        subtitle="Here's where things stand with your friends."
      />

      {/* Hero: one net number + the single most useful next step. */}
      <Card className="mb-4 p-5 md:shrink-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-ink-soft">Net balance</p>
            {friends === null ? (
              <div className="skeleton mt-2 h-9 w-44" />
            ) : currencies.length === 0 ? (
              <>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">You&rsquo;re all settled up</p>
                <p className="mt-1 text-sm text-ink-faint">Nothing outstanding with your friends right now.</p>
              </>
            ) : (
              <>
                {/* Each currency nets separately (never summed across currencies),
                    and each carries an explicit owed/owe word so direction never
                    relies on color alone. */}
                <div className="mt-1 flex flex-wrap items-end gap-x-7 gap-y-2">
                  {currencies.map(([cur, amt]) => (
                    <div key={cur} className="min-w-0">
                      <p className={`text-4xl font-semibold tracking-tight tnum ${amt > 0 ? "text-owed" : "text-owe"}`}>
                        <Money cents={amt} currency={cur} signed />
                      </p>
                      <p className={`mt-0.5 text-xs font-medium ${amt > 0 ? "text-owed" : "text-owe"}`}>
                        {amt > 0 ? "owed to you" : "you owe"}{currencies.length > 1 ? ` · ${cur}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
                {singleCur && owedTotal > 0 && oweTotal > 0 && (
                  <p className="mt-1.5 text-sm text-ink-faint">
                    <span className="text-owed">{fmtMoney(owedTotal, singleCur)} owed to you</span>
                    {" · "}
                    <span className="text-owe">{fmtMoney(oweTotal, singleCur)} you owe</span>
                  </p>
                )}
              </>
            )}
          </div>

          {/* One contextual next step — the sidebar owns the persistent "Add
              expense" primary, so the hero coaches the most useful action. */}
          <div className="flex shrink-0 sm:justify-end">
            {topDebt ? (
              <Link href={`/people/${topDebt.f.id}`} className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto">
                  <HandCoins className="h-4 w-4" /> Settle up with {topDebt.f.displayName.split(" ")[0]} · <Money cents={-topDebt.amt} currency={topDebt.cur} />
                </Button>
              </Link>
            ) : topCreditor ? (
              <Link href={`/people/${topCreditor.f.id}`} className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto">
                  <Bell className="h-4 w-4" /> Remind {topCreditor.f.displayName.split(" ")[0]} · <Money cents={topCreditor.amt} currency={topCreditor.cur} />
                </Button>
              </Link>
            ) : (
              <Link href={addExpenseHref} className="w-full sm:w-auto">
                <Button variant="secondary" className="w-full sm:w-auto">
                  <Plus className="h-4 w-4" /> Add an expense
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 md:items-start">
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
                icon={<Users className="h-7 w-7" />}
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
                    <Link href={`/groups/${g.id}`} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                        <Users className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium" title={g.name}>{g.name}</span>
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
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            {friends === null ? (
              <SkeletonRows n={3} />
            ) : friends.length === 0 ? (
              <EmptyState
                icon={<Users className="h-7 w-7" />}
                title="No friends yet"
                hint="Add friends from the Balances page to start splitting."
              />
            ) : (
              <ul className="divide-y divide-line">
                {friends.map((f) => {
                  const nets = Object.entries(f.netByCurrency).filter(([, v]) => v !== 0);
                  return (
                    <li key={f.id}>
                      <Link href={`/people/${f.id}`} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                        <Avatar name={f.displayName} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={f.displayName}>{f.displayName}</span>
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
          <CardHeader
            title="Recent activity"
            action={
              <Link href="/activity" className="flex items-center gap-1 text-sm font-medium text-accent hover:underline">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            {activity === null ? (
              <SkeletonRows n={4} />
            ) : activityPeek.length === 0 ? (
              <EmptyState
                icon={<ScrollText className="h-7 w-7" />}
                title="Nothing yet"
                hint="Expenses and settlements will show up here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {activityPeek.slice(0, 7).map((a) => (
                  <li key={a.id} className="px-4 py-2.5">
                    <p className="text-sm leading-snug">{a.summary}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
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

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="space-y-3 px-4 py-4">
      {[...Array(n)].map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" />
      ))}
    </div>
  );
}
