"use client";

import { useCallback, useEffect, useState } from "react";
import { api, useApiData, useSync } from "@/lib/client";
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

function expenseQuery(filters: { q: string; cat: string; payer: string; from: string; to: string }, limit: number) {
  const p = new URLSearchParams();
  if (filters.q.trim()) p.set("q", filters.q.trim());
  if (filters.cat) p.set("categoryId", filters.cat);
  if (filters.payer) p.set("payerId", filters.payer);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  p.set("limit", String(limit));
  return p;
}

function useExpenses(groupId: number, filters: { q: string; cat: string; payer: string; from: string; to: string }, limit: number) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [hasMoreExpenses, setHasMoreExpenses] = useState(false);
  const reload = useCallback(() => {
    api<{ expenses: Expense[]; hasMore: boolean }>(`/api/groups/${groupId}/expenses?${expenseQuery(filters, limit)}`)
      .then((r) => { setExpenses(r.expenses); setHasMoreExpenses(r.hasMore); })
      .catch(() => {});
  }, [groupId, filters, limit]);
  useEffect(() => {
    const t = setTimeout(reload, filters.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [reload, filters.q]);
  return { expenses, hasMoreExpenses, reloadExpenses: reload };
}

function useSettlements(groupId: number, limit: number) {
  const { data, reload } = useApiData<{ settlements: Settlement[]; hasMore: boolean }>(
    `/api/groups/${groupId}/settlements?limit=${limit}`,
    0,
    { sync: false }
  );
  return { settlements: data?.settlements ?? null, hasMoreSettlements: data?.hasMore ?? false, reloadSettlements: reload };
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
  const detailState = useApiData<GroupDetail>(`/api/groups/${groupId}`, 0, { sync: false });
  const recurringState = useApiData<{ recurring: Recurring[] }>(`/api/groups/${groupId}/recurring`, 0, { sync: false });
  const activityState = useApiData<{ activity: GroupActivity[] }>(`/api/groups/${groupId}/activity`, 0, { sync: false });
  const { expenses, hasMoreExpenses, reloadExpenses } = useExpenses(groupId, filters, expenseLimit);
  const { settlements, hasMoreSettlements, reloadSettlements } = useSettlements(groupId, settlementLimit);
  const [refreshKey, setRefreshKey] = useState(0);
  const loadError = detailState.error
    ? detailState.error
    : recurringState.error || activityState.error ? "Some group data could not be refreshed" : null;

  const reloadOverview = useCallback(() => {
    detailState.reload();
    recurringState.reload();
    activityState.reload();
    reloadSettlements();
  }, [detailState, recurringState, activityState, reloadSettlements]);

  const refreshAll = useCallback(() => {
    reloadOverview();
    reloadExpenses();
  }, [reloadOverview, reloadExpenses]);

  useSync(() => {
    refreshAll();
    setRefreshKey((k) => k + 1);
  });

  return {
    detail: detailState.data,
    expenses,
    hasMoreExpenses,
    recurring: recurringState.data?.recurring.filter((x) => x.active) ?? [],
    settlements,
    hasMoreSettlements,
    activity: activityState.data?.activity ?? null,
    refreshKey,
    loadError,
    loadDetail: reloadOverview,
    refreshAll,
  };
}
