"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiClientError, useSync } from "@/lib/client";
import type { Member } from "@/components/expense-form";

export interface GroupDetail {
  group: { id: number; name: string; currency: string; inviteCode: string; createdBy: number };
  members: (Member & { username: string })[];
  balances: { userId: number; displayName: string; netCents: number }[];
  suggestions: { from: number; to: number; amountCents: number }[];
}

export interface Expense {
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

export interface Recurring {
  id: number;
  title: string;
  amountCents: number;
  currency: string;
  payerId: number;
  payerName: string;
  cadence: string;
  nextDate: string;
  active: boolean;
}

export interface Settlement {
  id: number;
  payerId: number;
  recipientId: number;
  payerName: string;
  recipientName: string;
  amountCents: number;
  currency: string;
  date: string;
  note: string;
}

export interface GroupActivity {
  id: number;
  actorId: number;
  actorName: string;
  actionText: string;
  summary: string;
  createdAt: string;
}

export function useGroupPageData({
  groupId,
  filters,
  expenseLimit,
  settlementLimit,
}: {
  groupId: number;
  filters: { q: string; cat: string; payer: string; from: string; to: string };
  expenseLimit: number;
  settlementLimit: number;
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(false);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [settlements, setSettlements] = useState<Settlement[] | null>(null);
  const [hasMoreSettlements, setHasMoreSettlements] = useState(false);
  const [activity, setActivity] = useState<GroupActivity[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadDetail = useCallback(() => {
    api<GroupDetail>(`/api/groups/${groupId}`)
      .then(setDetail)
      .catch((e) => setLoadError(e instanceof ApiClientError ? e.message : "Could not load group"));
    api<{ recurring: Recurring[] }>(`/api/groups/${groupId}/recurring`)
      .then((r) => setRecurring(r.recurring.filter((x) => x.active)))
      .catch(() => {});
    api<{ activity: GroupActivity[] }>(`/api/groups/${groupId}/activity`)
      .then((r) => setActivity(r.activity))
      .catch(() => {});
    api<{ settlements: Settlement[]; hasMore: boolean }>(`/api/groups/${groupId}/settlements?limit=${settlementLimit}`)
      .then((r) => { setSettlements(r.settlements); setHasMoreSettlements(r.hasMore); })
      .catch(() => {});
  }, [groupId, settlementLimit]);

  const loadExpenses = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.q.trim()) p.set("q", filters.q.trim());
    if (filters.cat) p.set("categoryId", filters.cat);
    if (filters.payer) p.set("payerId", filters.payer);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    p.set("limit", String(expenseLimit));
    api<{ expenses: Expense[]; hasMore: boolean }>(`/api/groups/${groupId}/expenses?${p}`)
      .then((r) => { setExpenses(r.expenses); setHasMoreExpenses(r.hasMore); })
      .catch(() => {});
  }, [groupId, filters, expenseLimit]);

  useEffect(loadDetail, [loadDetail]);
  useEffect(() => {
    const t = setTimeout(loadExpenses, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [loadExpenses, filters.q]);

  useSync(() => {
    loadDetail();
    loadExpenses();
    setRefreshKey((k) => k + 1);
  });

  return {
    detail,
    expenses,
    hasMoreExpenses,
    recurring,
    settlements,
    hasMoreSettlements,
    activity,
    refreshKey,
    loadError,
    loadDetail,
    loadExpenses,
    refreshAll: () => {
      loadDetail();
      loadExpenses();
    },
  };
}
