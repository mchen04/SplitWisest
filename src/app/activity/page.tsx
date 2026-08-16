"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { fmtTime, markRead, useApiData, useSync } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, EmptyState, Button } from "@/components/ui";
import { ActivitySummary } from "@/components/activity-summary";

// Calendar-day bucket for the feed, so events scan by day instead of as one wall.
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

interface Activity {
  id: number;
  groupId: number | null;
  groupName: string | null;
  actorId: number;
  actorName: string;
  actionText: string;
  summary: string;
  createdAt: string;
}

export default function ActivityPage() {
  const [limit, setLimit] = useState(50);
  const { data, reload } = useApiData<{ activity: Activity[]; hasMore: boolean }>(
    `/api/activity?limit=${limit}`, 0, { sync: false }
  );
  const activity = data?.activity ?? null;
  const hasMore = data?.hasMore ?? false;

  useEffect(() => {
    const maxId = activity?.reduce((max, item) => Math.max(max, item.id), 0) ?? 0;
    if (maxId > 0) markRead("activity", maxId);
  }, [activity]);
  useSync((c, prev) => {
    if (c.activityCursor !== prev.activityCursor) reload();
  });

  return (
    <AppShell>
      <PageTitle title="Activity" subtitle="Everything happening across your groups and friends." />
      <Card className="flex flex-col md:min-h-0 md:flex-1">
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {activity === null ? (
            <div className="space-y-2 p-3">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}</div>
          ) : activity.length === 0 ? (
            <EmptyState icon={<ScrollText className="h-8 w-8" />} title="Nothing yet" hint="Expenses, settlements, and group changes will show up here." />
          ) : (
            <ul>
              {activity.map((a, i) => {
                const showDay = i === 0 || dayLabel(a.createdAt) !== dayLabel(activity[i - 1].createdAt);
                return (
                  <li key={a.id} className="border-b border-line last:border-0">
                    {showDay && (
                      <p className="bg-subtle px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                        {dayLabel(a.createdAt)}
                      </p>
                    )}
                    <div className="px-4 py-2.5">
                      <ActivitySummary activity={a} />
                      <p className="mt-0.5 text-xs text-ink-faint">
                        {a.groupName ? `${a.groupName} · ` : ""}
                        {fmtTime(a.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {activity && activity.length > 0 && hasMore && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="secondary" onClick={() => setLimit((l) => l + 50)}>Load more</Button>
            </div>
          )}
        </div>
      </Card>
    </AppShell>
  );
}
