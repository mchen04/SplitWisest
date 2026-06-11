"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import {
  ArrowLeft, Plus, HandCoins, Download, Pencil, Trash2, Receipt, Paperclip,
  RefreshCcw, MessageSquare, ScrollText, Scale, Search, ChartBar, X,
} from "lucide-react";
import { api, ApiClientError, fmtMoney, fmtDate, fmtTime, useMe, useSync, useFilters } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, CardHeader, Money, EmptyState, Button, Avatar, Input, Select, Modal } from "@/components/ui";
import { ExpenseForm, Member } from "@/components/expense-form";
import { SettleModal } from "@/components/settle-modal";
import { RecurringModal } from "@/components/recurring-modal";
import { ChatPane } from "@/components/chat";
import { BarChart, TimeChart } from "@/components/charts";

interface GroupDetail {
  group: { id: number; name: string; currency: string; inviteCode: string };
  members: (Member & { username: string })[];
  balances: { userId: number; displayName: string; netCents: number }[];
  suggestions: { from: number; to: number; amountCents: number }[];
}

interface Expense {
  id: number;
  title: string;
  amountCents: number;
  currency: string;
  convertedCents: number;
  date: string;
  payerId: number;
  payerName: string;
  categoryId: number | null;
  categoryName: string | null;
  notes: string;
  splitMethod: string;
  attachmentCount: number;
  shares: { userId: number; shareCents: number; convertedShareCents: number }[];
}

interface Recurring {
  id: number;
  title: string;
  amountCents: number;
  currency: string;
  payerName: string;
  cadence: string;
  nextDate: string;
  active: boolean;
}

type Tab = "expenses" | "balances" | "chat" | "activity";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const groupId = Number(id);
  const me = useMe();
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [activity, setActivity] = useState<{ id: number; summary: string; createdAt: string }[] | null>(null);
  const [tab, setTab] = useState<Tab>("expenses");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // filters
  const { filters, setFilter, reset: resetFilters, active: filtersActive } =
    useFilters({ q: "", cat: "", payer: "", from: "", to: "" });
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  // modals
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<Parameters<typeof ExpenseForm>[0]["existing"]>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<{ payerId: number; recipientId: number; amountCents: number } | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);

  const loadDetail = useCallback(() => {
    api<GroupDetail>(`/api/groups/${groupId}`)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof ApiClientError ? e.message : "Could not load group"));
    api<{ recurring: Recurring[] }>(`/api/groups/${groupId}/recurring`)
      .then((r) => setRecurring(r.recurring.filter((x) => x.active)))
      .catch(() => {});
    api<{ activity: { id: number; summary: string; createdAt: string }[] }>(`/api/groups/${groupId}/activity`)
      .then((r) => setActivity(r.activity))
      .catch(() => {});
  }, [groupId]);

  const loadExpenses = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.cat) p.set("categoryId", filters.cat);
    if (filters.payer) p.set("payerId", filters.payer);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    api<{ expenses: Expense[] }>(`/api/groups/${groupId}/expenses?${p}`)
      .then((r) => setExpenses(r.expenses))
      .catch(() => {});
  }, [groupId, filters]);

  useEffect(loadDetail, [loadDetail]);
  useEffect(() => {
    const t = setTimeout(loadExpenses, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadExpenses, filters.q]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") === "1") {
      setEditing(null);
      setExpenseOpen(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    api<{ categories: { id: number; name: string }[] }>("/api/categories")
      .then((r) => setCategories(r.categories))
      .catch(() => {});
  }, []);

  useSync(() => {
    loadDetail();
    loadExpenses();
    setRefreshKey((k) => k + 1);
  });

  const refreshAll = () => {
    loadDetail();
    loadExpenses();
  };

  async function openEdit(expenseId: number) {
    try {
      const r = await api<{ expense: NonNullable<typeof editing> }>(`/api/expenses/${expenseId}`);
      setEditing(r.expense);
      setExpenseOpen(true);
    } catch (e) {
      // A 404 means another member deleted it — refresh the list to drop it.
      // Anything else is unexpected and should surface, not vanish.
      if (e instanceof ApiClientError) refreshAll();
      else throw e;
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api(`/api/expenses/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      refreshAll();
    } finally {
      setDeleteBusy(false);
    }
  }

  const charts = useMemo(() => {
    if (!expenses || !detail) return null;
    const byCat = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const byPayer = new Map<string, number>();
    for (const e of expenses) {
      byCat.set(e.categoryName ?? "Uncategorized", (byCat.get(e.categoryName ?? "Uncategorized") ?? 0) + e.convertedCents);
      const m = String(e.date).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + e.convertedCents);
      byPayer.set(e.payerName, (byPayer.get(e.payerName) ?? 0) + e.convertedCents);
    }
    return {
      byCat: [...byCat.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      byMonth: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
        .map(([label, value]) => ({ label: label.slice(2), value })),
      byPayer: [...byPayer.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    };
  }, [expenses, detail]);

  if (loadError) {
    return (
      <AppShell>
        <EmptyState title={loadError} action={<Link href="/groups"><Button variant="secondary">Back to groups</Button></Link>} />
      </AppShell>
    );
  }

  const memberName = (uid: number) => detail?.members.find((m) => m.id === uid)?.displayName ?? "Someone";

  const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "balances", label: "Balances", icon: Scale },
    { key: "chat", label: "Chat", icon: MessageSquare },
    { key: "activity", label: "Activity", icon: ScrollText },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href="/groups" aria-label="Back to groups" className="rounded-lg p-2 text-ink-soft hover:bg-accent-soft">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {detail ? (
            <>
              <h1 className="truncate font-display text-2xl font-bold tracking-tight">{detail.group.name}</h1>
              <p className="text-xs text-ink-faint">
                {detail.members.length} members · {detail.group.currency} · invite code{" "}
                <code className="rounded bg-paper px-1.5 py-0.5 font-medium text-ink-soft">{detail.group.inviteCode}</code>
              </p>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="skeleton h-7 w-48" />
              <div className="skeleton h-3.5 w-64" />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <a href={`/api/groups/${groupId}/export`} download>
            <Button variant="secondary" title="Export CSV">
              <Download className="h-4 w-4" /> <span className="hidden sm:inline">CSV</span>
            </Button>
          </a>
          <Button
            variant="secondary"
            disabled={(detail?.members.length ?? 0) < 2}
            title={(detail?.members.length ?? 0) < 2 ? "Invite a friend first" : undefined}
            onClick={() => { setSettlePrefill(null); setSettleOpen(true); }}
          >
            <HandCoins className="h-4 w-4" /> <span className="hidden sm:inline">Settle up</span>
          </Button>
          <Button onClick={() => { setEditing(null); setExpenseOpen(true); }}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add expense</span>
          </Button>
        </div>
      </div>

      {/* Balance strip */}
      <Card className="mb-4 overflow-x-auto">
        <div className="flex min-h-20 items-stretch divide-x divide-line">
          {detail === null ? (
            <div className="flex flex-1 items-center gap-4 px-4">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 w-32" />)}
            </div>
          ) : (
            detail.balances.map((b) => (
              <div key={b.userId} className="flex min-w-36 flex-1 flex-col justify-center gap-0.5 px-4 py-3">
                <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <Avatar name={b.displayName} size="sm" /> {b.displayName}
                </span>
                <span className="font-display text-lg font-semibold">
                  {b.netCents === 0 ? (
                    <span className="text-ink-faint">settled</span>
                  ) : (
                    <Money cents={b.netCents} currency={detail.group.currency} signed />
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Settlement suggestions */}
      {detail && detail.suggestions.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Suggested settle-up" />
          <ul className="divide-y divide-line">
            {detail.suggestions.map((s, i) => (
              <li key={i} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-2 text-sm">
                <span className="font-medium">{memberName(s.from)}</span>
                <span className="text-ink-faint">pays</span>
                <span className="font-medium">{memberName(s.to)}</span>
                <span className="tnum ml-auto font-semibold">{fmtMoney(s.amountCents, detail.group.currency)}</span>
                <Button
                  variant="secondary"
                  className="!min-h-8 !px-2.5 !py-1 text-xs"
                  onClick={() => {
                    setSettlePrefill({ payerId: s.from, recipientId: s.to, amountCents: s.amountCents });
                    setSettleOpen(true);
                  }}
                >
                  Record
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Tabs */}
      <div role="tablist" aria-label="Group sections" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? "bg-accent-soft text-accent-dark" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "expenses" && (
        <>
          <Card className="mb-4 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input value={filters.q} onChange={setFilter("q")} placeholder="Search expenses" className="pl-8" aria-label="Search expenses" />
              </div>
              <Select value={filters.cat} onChange={setFilter("cat")} aria-label="Filter by category">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Select value={filters.payer} onChange={setFilter("payer")} aria-label="Filter by payer">
                <option value="">All payers</option>
                {detail?.members.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
              </Select>
              <Input type="date" value={filters.from} onChange={setFilter("from")} aria-label="From date" />
              <Input type="date" value={filters.to} onChange={setFilter("to")} aria-label="To date" />
            </div>
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Expenses"
              action={
                recurring.length > 0 ? (
                  <span className="flex items-center gap-1 text-xs text-ink-faint">
                    <RefreshCcw className="h-3.5 w-3.5" /> {recurring.length} recurring
                  </span>
                ) : undefined
              }
            />
            {expenses === null ? (
              <div className="space-y-3 p-4">
                {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
              </div>
            ) : expenses.length === 0 ? (
              <EmptyState
                icon={<Receipt className="h-8 w-8" />}
                title={filtersActive ? "No expenses match your filters" : "No expenses yet"}
                hint={filtersActive ? "Try clearing the filters." : "Add the first shared expense to get rolling."}
                action={
                  !filtersActive ? (
                    <Button onClick={() => { setEditing(null); setExpenseOpen(true); }}>
                      <Plus className="h-4 w-4" /> Add expense
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {expenses.map((e) => {
                  const myShare = me ? (e.shares.find((s) => s.userId === me.id)?.convertedShareCents ?? 0) : 0;
                  return (
                    <li key={e.id} className="group flex min-h-16 items-center gap-3 px-4 py-2.5">
                      <div className="hidden w-12 shrink-0 text-center sm:block">
                        <p className="text-[11px] font-semibold uppercase text-ink-faint">
                          {new Date(String(e.date).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
                        </p>
                        <p className="font-display text-lg font-semibold leading-none">
                          {new Date(String(e.date).slice(0, 10) + "T00:00:00").getDate()}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {e.title}
                          {e.attachmentCount > 0 && <Paperclip className="ml-1.5 inline h-3.5 w-3.5 text-ink-faint" />}
                        </p>
                        <p className="truncate text-xs text-ink-faint">
                          <span className="sm:hidden">{fmtDate(e.date)} · </span>
                          {e.payerName} paid · {e.categoryName ?? "Uncategorized"} · {e.splitMethod}
                          {e.currency !== detail?.group.currency && ` · ${fmtMoney(e.amountCents, e.currency)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum font-semibold">{fmtMoney(e.convertedCents, detail?.group.currency ?? e.currency)}</p>
                        <p className="text-xs text-ink-faint">
                          {me && e.payerId === me.id
                            ? `you lent ${fmtMoney(e.convertedCents - myShare, detail?.group.currency ?? e.currency)}`
                            : myShare > 0
                              ? `your share ${fmtMoney(myShare, detail?.group.currency ?? e.currency)}`
                              : "not involved"}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => openEdit(e.id)} aria-label={`Edit ${e.title}`} className="rounded-lg p-2 text-ink-faint hover:bg-accent-soft hover:text-accent-dark">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleting(e)} aria-label={`Delete ${e.title}`} className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Recurring */}
          <Card className="mt-4">
            <CardHeader
              title="Recurring expenses"
              action={
                <Button variant="ghost" className="!min-h-8 !px-2.5 !py-1 text-xs" onClick={() => setRecurringOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add recurring
                </Button>
              }
            />
            {recurring.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-faint">No recurring expenses. Rent, subscriptions, and bills can repeat weekly or monthly.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recurring.map((r) => (
                  <li key={r.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
                    <RefreshCcw className="h-4 w-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block text-xs text-ink-faint">
                        {r.cadence} · next {fmtDate(r.nextDate)} · {r.payerName} pays
                      </span>
                    </span>
                    <span className="tnum font-medium">{fmtMoney(r.amountCents, r.currency)}</span>
                    <button
                      aria-label={`Stop ${r.title}`}
                      onClick={async () => {
                        if (!window.confirm(`Stop the recurring expense "${r.title}"? Existing expenses are kept.`)) return;
                        try {
                          await api(`/api/recurring/${r.id}`, { method: "DELETE" });
                          loadDetail();
                        } catch (e) {
                          window.alert(e instanceof ApiClientError ? e.message : "Could not stop the recurring expense");
                        }
                      }}
                      className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Charts */}
          {charts && expenses && expenses.length > 0 && detail && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ChartBar className="h-4 w-4" /> By category</h3>
                <BarChart data={charts.byCat} currency={detail.group.currency} title="Spending by category" />
              </Card>
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ChartBar className="h-4 w-4" /> Over time</h3>
                <TimeChart data={charts.byMonth} currency={detail.group.currency} />
              </Card>
              <Card className="p-4">
                <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft"><ChartBar className="h-4 w-4" /> Paid by person</h3>
                <BarChart data={charts.byPayer} currency={detail.group.currency} title="Total paid by person" />
              </Card>
            </div>
          )}
        </>
      )}

      {tab === "balances" && detail && (
        <Card>
          <CardHeader title="Who owes who" />
          {detail.suggestions.length === 0 ? (
            <EmptyState icon={<Scale className="h-8 w-8" />} title="All settled up" hint="Nobody owes anything in this group right now." />
          ) : (
            <ul className="divide-y divide-line">
              {detail.suggestions.map((s, i) => (
                <li key={i} className="flex min-h-14 flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={memberName(s.from)} size="sm" />
                  <span className="text-sm"><strong>{memberName(s.from)}</strong> should pay <strong>{memberName(s.to)}</strong></span>
                  <span className="tnum ml-auto font-display text-lg font-semibold">{fmtMoney(s.amountCents, detail.group.currency)}</span>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSettlePrefill({ payerId: s.from, recipientId: s.to, amountCents: s.amountCents });
                      setSettleOpen(true);
                    }}
                  >
                    <HandCoins className="h-4 w-4" /> Record payment
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "chat" && me && (
        <Card>
          <ChatPane
            endpoint={`/api/groups/${groupId}/messages`}
            meId={me.id}
            refreshKey={refreshKey}
            emptyHint="No messages yet. Say hi or hash out that bill."
          />
        </Card>
      )}

      {tab === "activity" && (
        <Card>
          <CardHeader title="Activity log" />
          {activity === null ? (
            <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}</div>
          ) : activity.length === 0 ? (
            <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No activity yet" />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <p className="text-sm leading-snug">{a.summary}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{fmtTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Modals */}
      {detail && me && (
        <>
          <ExpenseForm
            groupId={groupId}
            groupCurrency={detail.group.currency}
            members={detail.members}
            meId={me.id}
            existing={editing}
            open={expenseOpen}
            onClose={() => setExpenseOpen(false)}
            onSaved={refreshAll}
          />
          <SettleModal
            open={settleOpen}
            onClose={() => setSettleOpen(false)}
            onSaved={refreshAll}
            groupId={groupId}
            members={detail.members}
            meId={me.id}
            defaultCurrency={detail.group.currency}
            prefill={settlePrefill}
          />
          <RecurringModal
            open={recurringOpen}
            onClose={() => setRecurringOpen(false)}
            onSaved={loadDetail}
            groupId={groupId}
            members={detail.members}
            meId={me.id}
            defaultCurrency={detail.group.currency}
          />
        </>
      )}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete expense?">
        <p className="text-sm text-ink-soft">
          Delete <strong>{deleting?.title}</strong> ({deleting && fmtMoney(deleting.amountCents, deleting.currency)})?
          Balances will update for everyone. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" busy={deleteBusy} onClick={confirmDelete}>Delete expense</Button>
        </div>
      </Modal>
    </AppShell>
  );
}
