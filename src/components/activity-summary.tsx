"use client";

import Link from "next/link";

export interface ActivitySummaryData {
  actorId: number;
  actorName: string;
  summary: string;
}

export function ActivitySummary({ activity }: { activity: ActivitySummaryData }) {
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
