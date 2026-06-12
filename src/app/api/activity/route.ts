import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { activityActionText } from "@/lib/activity";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const q = req.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(q.get("limit")) || 50, 1), 1000);
  const offset = Math.max(Number(q.get("offset")) || 0, 0);
  const rows = await sql`
    SELECT a.id, a.group_id, g.name AS group_name, a.actor_id, u.display_name AS actor_name,
      a.type, a.summary, a.data, a.created_at
    FROM activity a
    JOIN users u ON u.id = a.actor_id
    LEFT JOIN groups g ON g.id = a.group_id
    WHERE a.id > ${since} AND (
      a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
      OR (a.group_id IS NULL AND a.actor_id = ${user.id})
    )
    ORDER BY a.id DESC LIMIT ${limit + 1} OFFSET ${offset}`;
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    hasMore,
    activity: page.map((a) => ({
      id: Number(a.id),
      groupId: a.group_id ? Number(a.group_id) : null,
      groupName: a.group_name,
      actorId: Number(a.actor_id),
      actorName: a.actor_name,
      actionText: activityActionText({ summary: a.summary, actorName: a.actor_name, data: a.data }),
      type: a.type,
      summary: a.summary,
      createdAt: a.created_at,
    })),
  });
});
