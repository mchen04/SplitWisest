"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { api, fmtTime, markRead, useSync } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, EmptyState, Button } from "@/components/ui";

interface Activity {
  id: number;
  groupId: number | null;
  groupName: string | null;
  actorId: number;
  actorName: string;
  summary: string;
  createdAt: string;
}

export default function ActivityPage() {
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [limit, setLimit] = useState(50);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(() => {
    api<{ activity: Activity[]; hasMore: boolean }>(`/api/activity?limit=${limit}`)
      .then((r) => {
        setActivity(r.activity);
        setHasMore(r.hasMore);
        const maxId = r.activity.reduce((m, a) => Math.max(m, a.id), 0);
        if (maxId > 0) markRead("activity", maxId);
      })
      .catch(() => {});
  }, [limit]);

  useEffect(load, [load]);
  useSync(load);

  return (
    <AppShell>
      <PageTitle title="Activity" subtitle="Everything happening across your groups and friends." />
      <Card className="flex flex-col md:min-h-0 md:flex-1">
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
          {activity === null ? (
            <div className="space-y-3 p-4">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-8 w-full" />)}</div>
          ) : activity.length === 0 ? (
            <EmptyState icon={<ScrollText className="h-8 w-8" />} title="Nothing yet" hint="Expenses, settlements, and group changes will show up here." />
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="px-4 py-2.5">
                  <ActivitySummary activity={a} />
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {a.groupName ? `${a.groupName} · ` : ""}
                    {fmtTime(a.createdAt)}
                  </p>
                </li>
              ))}
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

function ActivitySummary({ activity }: { activity: Activity }) {
  const rest = activity.summary.startsWith(activity.actorName)
    ? activity.summary.slice(activity.actorName.length).trimStart()
    : `· ${activity.summary}`;
  return (
    <p className="text-sm leading-snug">
      <Link href={`/people/${activity.actorId}`} className="font-medium hover:text-accent-dark hover:underline">
        {activity.actorName}
      </Link>
      <span className="text-ink-soft"> {rest}</span>
    </p>
  );
}
