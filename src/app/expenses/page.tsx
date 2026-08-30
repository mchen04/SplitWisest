"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Receipt, Search, X } from "lucide-react";
import { fmtMoney, fmtDate, useApiData, useFilters } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, EmptyState, Input, Select, Button, Chip } from "@/components/ui";

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

const EMPTY_FILTERS = { q: "", groupId: "", categoryId: "", friendId: "", from: "", to: "" };

export default function ExpensesPage() {
  const { filters, setFilter, reset, active: filtersActive } = useFilters(EMPTY_FILTERS);
  const [limit, setLimit] = useState(50);

  // Reset to the first page whenever the filters change.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLimit(50);
  }, [filters]);

  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.friendId) params.set("friendId", filters.friendId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  params.set("limit", String(limit));
  const { data } = useApiData<{ expenses: Expense[]; hasMore: boolean }>(`/api/expenses?${params}`, filters.q.trim() ? 250 : 0);
  const expenses = data?.expenses ?? null;
  const hasMore = data?.hasMore ?? false;
  const { data: groupsData } = useApiData<{ groups: { id: number; name: string }[] }>("/api/groups", 0, { sync: false });
  const { data: friendsData } = useApiData<{ friends: { id: number; displayName: string }[] }>("/api/friends", 0, { sync: false });
  const { data: categoriesData } = useApiData<{ categories: { id: number; name: string }[] }>("/api/categories", 0, { sync: false });
  const groups = groupsData?.groups ?? [];
  const friends = friendsData?.friends ?? [];
  const categories = categoriesData?.categories ?? [];

  return (
    <AppShell title="All expenses">
      <Card className="mb-4 p-2 md:shrink-0">
        <div className="grid grid-cols-1 gap-2 min-[25rem]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-7">
          <div className="relative min-[25rem]:col-span-2 sm:col-span-3 lg:col-span-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input value={filters.q} onChange={setFilter("q")} placeholder="Search by title or notes" className="pl-8" aria-label="Search expenses" />
          </div>
          <Select value={filters.groupId} onChange={setFilter("groupId")} aria-label="Filter by group">
            <option value="">All groups</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
          <Select value={filters.categoryId} onChange={setFilter("categoryId")} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <div className="min-[25rem]:col-span-2 sm:col-span-1">
            <Select value={filters.friendId} onChange={setFilter("friendId")} aria-label="Filter by friend">
              <option value="">Any friend</option>
              {friends.map((f) => <option key={f.id} value={f.id}>{f.displayName}</option>)}
            </Select>
          </div>
          <Input type="date" value={filters.from} onChange={setFilter("from")} aria-label="From date" />
          <Input type="date" value={filters.to} onChange={setFilter("to")} aria-label="To date" />
        </div>
        {filtersActive && (
          <button
            onClick={reset}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </Card>

      <Card className="flex flex-col md:min-h-0 md:flex-1">
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {expenses === null ? (
          <div className="space-y-2 p-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
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
                <Link href={`/groups/${e.groupId}?expense=${e.id}`} className="flex min-h-[var(--row-h)] items-center gap-3 px-4 py-2.5 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{e.title}</p>
                      <Chip className="shrink-0">{e.groupName}</Chip>
                    </div>
                    <p className="truncate text-xs text-ink-faint">
                      {fmtDate(e.date)} · {e.payerName} paid{e.categoryName ? ` · ${e.categoryName}` : ""}
                    </p>
                  </div>
                  <span className="tnum font-semibold">{fmtMoney(e.amountCents, e.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {expenses && expenses.length > 0 && hasMore && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" onClick={() => setLimit((l) => l + 50)}>Load more</Button>
          </div>
        )}
        </div>
      </Card>
    </AppShell>
  );
}
