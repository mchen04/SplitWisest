import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const rows = await sql`
    SELECT a.id, a.group_id, g.name AS group_name, a.type, a.summary, a.created_at
    FROM activity a LEFT JOIN groups g ON g.id = a.group_id
    WHERE a.id > ${since} AND (
      a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
      OR (a.group_id IS NULL AND a.actor_id = ${user.id})
    )
    ORDER BY a.id DESC LIMIT 50`;
  return NextResponse.json({
    activity: rows.map((a) => ({
      id: Number(a.id),
      groupId: a.group_id ? Number(a.group_id) : null,
      groupName: a.group_name,
      type: a.type,
      summary: a.summary,
      createdAt: a.created_at,
    })),
  });
});
