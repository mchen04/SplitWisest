"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, Plus, HandCoins, Download, Pencil, Trash2, Receipt, Paperclip,
  RefreshCcw, MessageSquare, ScrollText, Scale, Search, X, PieChart, Settings, Copy, ChevronDown, Users,
  SlidersHorizontal,
} from "lucide-react";
import { api, ApiClientError, fmtMoney, fmtDate, fmtTime, useMe, useFilters, useApiData } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, CardHeader, Money, EmptyState, Button, Avatar, Input, Select, Modal, Menu, MenuItem } from "@/components/ui";
import { ExpenseForm } from "@/components/expense-form";
import { SettleModal } from "@/components/settle-modal";
import { RecurringModal, ExistingRecurring } from "@/components/recurring-modal";
import { GroupSettingsModal } from "@/components/group-settings-modal";
import { ExpenseDetailModal } from "@/components/expense-detail";
import { ChatPane } from "@/components/chat";
import { SpendCharts } from "@/components/spend-charts";
import { ActivitySummary } from "@/components/activity-summary";
import { Expense, Settlement, useGroupPageData } from "./use-group-page-data";

type Tab = "expenses" | "balances" | "insights" | "chat" | "activity";

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const groupId = Number(id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const me = useMe();
  const [expenseLimit, setExpenseLimit] = useState(50);
  const [settlementLimit, setSettlementLimit] = useState(50);
  const [tab, setTab] = useState<Tab>("expenses");

  // filters
  const { filters, setFilter, reset: resetFilters, active: filtersActive } =
    useFilters({ q: "", cat: "", payer: "", from: "", to: "" });
  const { data: categoriesData } = useApiData<{ categories: { id: number; name: string }[] }>(
    "/api/categories", 0, { sync: false }
  );
  const categories = categoriesData?.categories ?? [];
  const {
    detail, expenses, hasMoreExpenses, recurring, settlements, hasMoreSettlements,
    activity, refreshKey, loadError, loadDetail, refreshAll,
  } = useGroupPageData({ groupId, filters, expenseLimit, settlementLimit });

  // modals
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editing, setEditing] = useState<Parameters<typeof ExpenseForm>[0]["existing"]>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settlePrefill, setSettlePrefill] = useState<{ payerId: number; recipientId: number; amountCents: number } | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<ExistingRecurring | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  function copyInviteLink() {
    if (!detail) return;
    navigator.clipboard.writeText(`${window.location.origin}/signup?invite=${detail.group.inviteCode}`).catch(() => {});
  }

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpenseLimit(50);
  }, [filters]);

  useEffect(() => {
    if (searchParams.get("add") === "1") {
      // Deep links may request the add-expense modal.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditing(null);
      setExpenseOpen(true);
    }
    const t = searchParams.get("tab");
    if (t && ["expenses", "balances", "insights", "chat", "activity"].includes(t)) {
      setTab(t as Tab);
    }
    const expenseId = Number(searchParams.get("expense"));
    if (Number.isInteger(expenseId) && expenseId > 0) {
      setTab("expenses");
      setDetailId(expenseId);
    }
    if (searchParams.get("add") === "1" || t || expenseId > 0) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [searchParams]);

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
      await api(`/api/expenses/${deleting.id}?expectedUpdatedAt=${encodeURIComponent(deleting.updatedAt)}`, { method: "DELETE" });
      setDeleting(null);
      refreshAll();
    } catch (err) {
      // A concurrent edit (stale version → 400), a delete by another member (404),
      // or a network error must surface — otherwise the modal just sits there.
      window.alert(err instanceof ApiClientError ? err.message : "Could not delete this expense");
      refreshAll();
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loadError) {
    return (
      <AppShell>
        <EmptyState title={loadError} action={<Link href="/groups"><Button variant="secondary">Back to groups</Button></Link>} />
      </AppShell>
    );
  }

  const memberName = (uid: number) => detail?.members.find((m) => m.id === uid)?.displayName ?? "Someone";
  const visibleBalances = detail?.balances.filter((b) => {
    const q = memberQuery.trim().toLowerCase();
    return !q || b.displayName.toLowerCase().includes(q);
  }) ?? [];

  const TABS: { key: Tab; label: string; icon: typeof Receipt }[] = [
    { key: "expenses", label: "Expenses", icon: Receipt },
    { key: "balances", label: "Balances", icon: Scale },
    { key: "insights", label: "Insights", icon: PieChart },
    { key: "chat", label: "Chat", icon: MessageSquare },
    { key: "activity", label: "Activity", icon: ScrollText },
  ];

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center gap-2.5 md:shrink-0">
        <Link href="/groups" aria-label="Back to groups" className="rounded-lg p-2 text-ink-soft hover:bg-subtle hover:text-ink">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0 flex-1">
          {detail ? (
            <>
              <GroupSwitcher currentId={groupId} currentName={detail.group.name} />
              <p className="text-xs text-ink-faint">
                {detail.members.length} {detail.members.length === 1 ? "member" : "members"} · {detail.group.currency}
              </p>
            </>
          ) : (
            <div className="space-y-1.5">
              <div className="skeleton h-7 w-48" />
              <div className="skeleton h-3.5 w-40" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled={(detail?.members.length ?? 0) < 2}
            title={(detail?.members.length ?? 0) < 2 ? "Invite a friend first" : undefined}
            aria-label="Settle up"
            onClick={() => { setSettlePrefill(null); setSettleOpen(true); }}
          >
            <HandCoins className="h-4 w-4" /> <span className="hidden sm:inline">Settle up</span>
          </Button>
          <Button aria-label="Add expense" onClick={() => { setEditing(null); setExpenseOpen(true); }}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add expense</span>
          </Button>
          <Menu label="Group menu">
            <MenuItem icon={<Copy className="h-4 w-4" />} onClick={copyInviteLink}>Copy invite link</MenuItem>
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => { window.location.href = `/api/groups/${groupId}/export`; }}>Export CSV</MenuItem>
            <MenuItem icon={<Settings className="h-4 w-4" />} onClick={() => setSettingsOpen(true)}>Group settings</MenuItem>
          </Menu>
        </div>
      </div>

      {/* Members rail (desktop) — a nested sidebar instead of a full-width
          horizontal strip, so member balances stop eating vertical space. */}
      <div className="md:flex md:min-h-0 md:flex-1 md:gap-2.5">
      <Card className="hidden md:flex md:min-h-0 md:w-52 md:shrink-0 md:flex-col">
        <CardHeader title={`Members${detail ? ` · ${detail.members.length}` : ""}`} />
        {detail && detail.balances.length > 8 && (
          <div className="border-b border-line p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
                placeholder="Search members"
                aria-label="Search group members"
                className="!min-h-[var(--control-h-sm)] !py-1 pl-8"
              />
            </div>
          </div>
        )}
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {detail === null ? (
            <div className="space-y-2 p-3">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}
            </div>
          ) : visibleBalances.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-faint">No members match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {visibleBalances.map((b) => (
                <li key={b.userId}>
                  <Link href={`/people/${b.userId}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-subtle">
                    <Avatar name={b.displayName} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={b.displayName}>{b.displayName}</span>
                    <span className="tnum text-xs font-semibold">
                      {b.netCents === 0 ? (
                        <span className="font-normal text-ink-faint">settled</span>
                      ) : (
                        <Money cents={b.netCents} currency={detail.group.currency} signed />
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* Compact member strip (mobile only) */}
      <Card className="relative mb-2.5 md:hidden">
        <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-stretch divide-x divide-line">
          {detail === null ? (
            <div className="flex flex-1 items-center gap-4 p-3">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 w-28" />)}
            </div>
          ) : (
            detail.balances.map((b) => (
              <Link key={b.userId} href={`/people/${b.userId}`} className="flex min-w-28 flex-1 flex-col justify-center gap-0.5 px-3 py-1.5 hover:bg-subtle">
                <span className="flex items-center gap-1.5 truncate text-xs text-ink-soft">
                  <Avatar name={b.displayName} size="sm" /> {b.displayName}
                </span>
                <span className="font-display text-base font-semibold">
                  {b.netCents === 0 ? (
                    <span className="text-ink-faint">settled</span>
                  ) : (
                    <Money cents={b.netCents} currency={detail.group.currency} signed />
                  )}
                </span>
              </Link>
            ))
          )}
        </div>
        </div>
        {/* Right-edge fade cues that the member strip scrolls horizontally. */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-[inherit] bg-gradient-to-l from-card to-transparent" aria-hidden />
      </Card>

      <div className="flex min-w-0 flex-col md:min-h-0 md:flex-1">
      {/* Tabs */}
      <div role="tablist" aria-label="Group sections" className="mb-2.5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-0.5 [scrollbar-width:none] md:shrink-0 [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors md:flex-1 ${
              tab === key ? "bg-accent-soft text-accent-dark" : "text-ink-soft hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <div className="md:min-h-0 md:flex-1 md:overflow-hidden">
      {tab === "expenses" && (
        <div className="flex flex-col md:h-full md:min-h-0">
          <Card className="mb-2.5 p-2 md:shrink-0">
            {/* Search is always visible; category/payer/date filters fold away so
                they don't push the expense list down the first viewport. */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input value={filters.q} onChange={setFilter("q")} placeholder="Search expenses" className="pl-8" aria-label="Search expenses" />
              </div>
              <Button
                variant={showFilters || filtersActive ? "secondary" : "ghost"}
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters || filtersActive}
                aria-label="Toggle filters"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
                {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
              </Button>
            </div>
            {(showFilters || filtersActive) && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
            )}
            {filtersActive && (
              <button
                onClick={resetFilters}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </Card>

          <Card className="flex flex-col md:min-h-0 md:flex-1">
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
            <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            {expenses === null ? (
              <div className="space-y-2 p-3">
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
                    <li key={e.id} className="group flex min-h-[var(--row-h)] items-center gap-2.5 px-3.5 py-1.5">
                      <button
                        onClick={() => setDetailId(e.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        aria-label={`View ${e.title}`}
                      >
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
                          {e.payerName} paid{e.categoryName ? ` · ${e.categoryName}` : ""} · split {e.splitMethod}
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
                      </button>
                      <div className="flex shrink-0 gap-0.5">
                        <button onClick={() => openEdit(e.id)} aria-label={`Edit ${e.title}`} className="rounded-lg p-2.5 text-ink-faint hover:bg-accent-soft hover:text-accent-dark">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => setDeleting(e)} aria-label={`Delete ${e.title}`} className="rounded-lg p-2.5 text-ink-faint hover:bg-danger-soft hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {expenses && expenses.length > 0 && hasMoreExpenses && (
              <div className="border-t border-line p-3 text-center">
                <Button variant="secondary" onClick={() => setExpenseLimit((l) => l + 50)}>
                  Load more
                </Button>
              </div>
            )}
            </div>
          </Card>
        </div>
      )}

      {tab === "insights" && (
        <div className="space-y-4 md:h-full md:overflow-y-auto">
          {/* Recurring */}
          <Card>
            <CardHeader
              title="Recurring expenses"
              action={
                <Button variant="ghost" className="!min-h-8 !px-2.5 !py-1 text-xs" onClick={() => setRecurringOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add recurring
                </Button>
              }
            />
            {recurring.length === 0 ? (
              <p className="px-3.5 py-3 text-sm text-ink-faint">No recurring expenses. Rent, subscriptions, and bills can repeat weekly or monthly.</p>
            ) : (
              <ul className="divide-y divide-line">
                {recurring.map((r) => (
                  <li key={r.id} className="flex min-h-10 items-center gap-2.5 px-3.5 py-1.5 text-sm">
                    <RefreshCcw className="h-4 w-4 shrink-0 text-ink-faint" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{r.title}</span>
                      <span className="block text-xs text-ink-faint">
                        {r.cadence} · next {fmtDate(r.nextDate)} · {r.payerName} pays
                      </span>
                    </span>
                    <span className="tnum font-medium">{fmtMoney(r.amountCents, r.currency)}</span>
                    <button
                      aria-label={`Edit ${r.title}`}
                      onClick={() => setEditingRecurring({
                        id: r.id, title: r.title, amountCents: r.amountCents, payerId: r.payerId,
                        currency: r.currency, categoryId: r.categoryId, participantIds: r.participantIds,
                        notes: r.notes, cadence: r.cadence as "weekly" | "monthly", nextDate: r.nextDate,
                        anchorDay: r.anchorDay, active: r.active, updatedAt: r.updatedAt,
                      })}
                      className="rounded-lg p-2 text-ink-faint hover:bg-accent-soft hover:text-accent-dark"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Stop ${r.title}`}
                      onClick={async () => {
                        if (!window.confirm(`Stop the recurring expense "${r.title}"? Existing expenses are kept.`)) return;
                        try {
                          await api(`/api/recurring/${r.id}?expectedUpdatedAt=${encodeURIComponent(r.updatedAt)}`, { method: "DELETE" });
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
          {expenses && expenses.length > 0 && detail && (
            <SpendCharts expenses={expenses} currency={detail.group.currency} />
          )}
          {(!expenses || expenses.length === 0) && (
            <EmptyState icon={<PieChart className="h-8 w-8" />} title="No insights yet" hint="Add a few expenses to see spending by category, over time, and by person." />
          )}
        </div>
      )}

      {tab === "balances" && detail && (
        <div className="space-y-4 md:h-full md:overflow-y-auto">
        <Card>
          <CardHeader title="Who owes who" />
          {detail.suggestions.length === 0 ? (
            <EmptyState icon={<Scale className="h-8 w-8" />} title="All settled up" hint="Nobody owes anything in this group right now." />
          ) : (
            <ul className="divide-y divide-line">
              {detail.suggestions.map((s, i) => (
                <li key={i} className="flex min-h-[var(--row-h)] flex-wrap items-center gap-2.5 px-3.5 py-1.5">
                  <Link href={`/people/${s.from}`} aria-label={`Open ${memberName(s.from)}'s profile`}>
                    <Avatar name={memberName(s.from)} size="sm" />
                  </Link>
                  <span className="text-sm">
                    <Link href={`/people/${s.from}`} className="font-semibold hover:text-accent-dark hover:underline">{memberName(s.from)}</Link>{" "}
                    should pay{" "}
                    <Link href={`/people/${s.to}`} className="font-semibold hover:text-accent-dark hover:underline">{memberName(s.to)}</Link>
                  </span>
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

        <Card>
          <CardHeader title="Recorded payments" />
          {settlements === null ? (
            <div className="space-y-2 p-3">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
          ) : settlements.length === 0 ? (
            <p className="px-3.5 py-3 text-sm text-ink-faint">No payments recorded yet. When someone settles up offline, record it here so balances stay accurate.</p>
          ) : (
            <ul className="divide-y divide-line">
              {settlements.map((s) => (
                <li key={s.id} className="flex min-h-[var(--row-h)] flex-wrap items-center gap-2.5 px-3.5 py-1.5">
                  <HandCoins className="h-4 w-4 shrink-0 text-owed" />
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block">
                      <Link href={`/people/${s.payerId}`} className="font-semibold hover:text-accent-dark hover:underline">{s.payerName}</Link>{" "}
                      paid{" "}
                      <Link href={`/people/${s.recipientId}`} className="font-semibold hover:text-accent-dark hover:underline">{s.recipientName}</Link>
                    </span>
                    <span className="block text-xs text-ink-faint">
                      {fmtDate(s.date)}
                      {s.note ? ` · ${s.note}` : ""}
                      {s.currency !== detail.group.currency ? ` · ${fmtMoney(s.amountCents, s.currency)}` : ""}
                    </span>
                  </span>
                  <span className="tnum font-semibold">{fmtMoney(s.amountCents, s.currency)}</span>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      onClick={() => setEditingSettlement(s)}
                      aria-label="Edit payment"
                      className="rounded-lg p-2 text-ink-faint hover:bg-accent-soft hover:text-accent-dark"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="Delete payment"
                      onClick={async () => {
                        if (!window.confirm(`Delete this recorded payment (${fmtMoney(s.amountCents, s.currency)} from ${s.payerName} to ${s.recipientName})? Balances will update.`)) return;
                        try {
                          await api(`/api/settlements/${s.id}?expectedUpdatedAt=${encodeURIComponent(s.updatedAt)}`, { method: "DELETE" });
                          refreshAll();
                        } catch (e) {
                          window.alert(e instanceof ApiClientError ? e.message : "Could not delete the payment");
                        }
                      }}
                      className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {settlements && settlements.length > 0 && hasMoreSettlements && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="secondary" onClick={() => setSettlementLimit((l) => l + 50)}>Load more</Button>
            </div>
          )}
        </Card>
        </div>
      )}

      {tab === "chat" && me && (
        <Card className="md:flex md:h-full md:min-h-0 md:flex-col">
          <ChatPane
            endpoint={`/api/groups/${groupId}/messages`}
            meId={me.id}
            refreshKey={refreshKey}
            emptyHint="No messages yet. Say hi or hash out that bill."
            readScope={`msg:group:${groupId}`}
          />
        </Card>
      )}

      {tab === "activity" && (
        <Card className="md:flex md:h-full md:min-h-0 md:flex-col">
          <CardHeader title="Activity log" />
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {activity === null ? (
            <div className="space-y-2 p-3">{[...Array(4)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}</div>
          ) : activity.length === 0 ? (
            <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No activity yet" />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="px-3.5 py-1.5">
                  <ActivitySummary activity={a} />
                  <p className="mt-0.5 text-xs text-ink-faint">{fmtTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
          </div>
        </Card>
      )}
      </div>
      </div>
      </div>

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
          <SettleModal
            open={!!editingSettlement}
            onClose={() => setEditingSettlement(null)}
            onSaved={refreshAll}
            groupId={groupId}
            members={detail.members}
            meId={me.id}
            defaultCurrency={detail.group.currency}
            existing={editingSettlement}
          />
          <RecurringModal
            open={recurringOpen || !!editingRecurring}
            onClose={() => { setRecurringOpen(false); setEditingRecurring(null); }}
            onSaved={loadDetail}
            groupId={groupId}
            members={detail.members}
            meId={me.id}
            defaultCurrency={detail.group.currency}
            existing={editingRecurring}
          />
          <GroupSettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            group={{ id: groupId, name: detail.group.name, createdBy: detail.group.createdBy }}
            members={detail.members}
            meId={me.id}
            onChanged={() => { loadDetail(); }}
            onGone={() => router.push("/groups")}
          />
        </>
      )}

      {me && (
        <ExpenseDetailModal
          expenseId={detailId}
          meId={me.id}
          open={detailId !== null}
          onClose={() => setDetailId(null)}
          onEdit={(eid) => { setDetailId(null); openEdit(eid); }}
          onDelete={(eid) => {
            const exp = expenses?.find((x) => x.id === eid) ?? null;
            setDetailId(null);
            if (exp) setDeleting(exp);
          }}
        />
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

// Inline dropdown so users can jump between groups without going back to the
// index — groups behave like switchable workspaces.
function GroupSwitcher({ currentId, currentName }: { currentId: number; currentName: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useApiData<{ groups: { id: number; name: string; unreadMessages?: number }[] }>("/api/groups");
  const others = (data?.groups ?? []).filter((g) => g.id !== currentId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div className="relative inline-block max-w-full">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Switch group (current: ${currentName})`}
        className="flex max-w-full items-center gap-1.5 rounded-lg text-left hover:text-accent-dark"
      >
        <span className="truncate font-display text-2xl font-bold tracking-tight">{currentName}</span>
        <ChevronDown className={`h-4.5 w-4.5 shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Your groups"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-pop"
        >
          {others.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-ink-faint">No other groups yet.</p>
          ) : (
            others.map((g) => (
              <Link
                key={g.id}
                href={`/groups/${g.id}`}
                role="option"
                aria-selected={false}
                className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium hover:bg-subtle"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                  <Users className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate">{g.name}</span>
                {!!g.unreadMessages && <span className="h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread messages" />}
              </Link>
            ))
          )}
          <Link href="/groups" className="mt-1 block border-t border-line px-3 py-2 text-sm font-medium text-accent hover:bg-subtle">
            All groups
          </Link>
        </div>
      )}
    </div>
  );
}
