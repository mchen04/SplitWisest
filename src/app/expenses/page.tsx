"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Receipt, Search, X } from "lucide-react";
import { api, fmtMoney, fmtDate, useSync } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, EmptyState, Input, Select } from "@/components/ui";

interface Expense {
  id: number;
  groupId: number;
  groupName: string;
  title: string;
  amountCents: number;
  currency: string;
  date: string;
  payerName: string;
  categoryName: string | null;
  splitMethod: string;
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [friends, setFriends] = useState<{ id: number; displayName: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [friendId, setFriendId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (groupId) p.set("groupId", groupId);
    if (categoryId) p.set("categoryId", categoryId);
    if (friendId) p.set("friendId", friendId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    api<{ expenses: Expense[] }>(`/api/expenses?${p}`).then((r) => setExpenses(r.expenses)).catch(() => {});
  }, [q, groupId, categoryId, friendId, from, to]);

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useSync(load);

  useEffect(() => {
    api<{ groups: { id: number; name: string }[] }>("/api/groups").then((r) => setGroups(r.groups)).catch(() => {});
    api<{ friends: { id: number; displayName: string }[] }>("/api/friends").then((r) => setFriends(r.friends)).catch(() => {});
    api<{ categories: { id: number; name: string }[] }>("/api/categories").then((r) => setCategories(r.categories)).catch(() => {});
  }, []);

  const filtersActive = !!(q || groupId || categoryId || friendId || from || to);

  return (
    <AppShell>
      <PageTitle title="All expenses" subtitle="Search and filter across every group you're in." />

      <Card className="mb-4 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          <div className="relative col-span-2 sm:col-span-3 lg:col-span-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title or notes" className="pl-8" aria-label="Search expenses" />
          </div>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} aria-label="Filter by group">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={friendId} onChange={(e) => setFriendId(e.target.value)} aria-label="Filter by friend">
            <option value="">Any friend involved</option>
            {friends.map((f) => <option key={f.id} value={f.id}>{f.displayName}</option>)}
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
        </div>
        {filtersActive && (
          <button
            onClick={() => { setQ(""); setGroupId(""); setCategoryId(""); setFriendId(""); setFrom(""); setTo(""); }}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </Card>

      <Card>
        {expenses === null ? (
          <div className="space-y-3 p-4">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : expenses.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={filtersActive ? "No expenses match" : "No expenses yet"}
            hint={filtersActive ? "Try loosening the filters." : "Expenses you add in any group will appear here."}
          />
        ) : (
          <ul className="divide-y divide-line">
            {expenses.map((e) => (
              <li key={e.id}>
                <Link href={`/groups/${e.groupId}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-paper">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="truncate text-xs text-ink-faint">
                      {fmtDate(e.date)} · {e.groupName} · {e.payerName} paid · {e.categoryName ?? "Uncategorized"}
                    </p>
                  </div>
                  <span className="tnum font-semibold">{fmtMoney(e.amountCents, e.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
