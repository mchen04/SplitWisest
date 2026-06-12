import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { activityActionText } from "@/lib/activity";
import { parseGroupId, requireGroupMember } from "@/lib/groups";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = parseGroupId((await params).id);
  await requireGroupMember(groupId, user.id);
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const rows = await sql`
    SELECT a.id, a.type, a.summary, a.data, a.created_at, a.actor_id, u.display_name
    FROM activity a JOIN users u ON u.id = a.actor_id
    WHERE a.group_id = ${groupId} AND a.id > ${since}
    ORDER BY a.id DESC LIMIT 100`;
  return NextResponse.json({
    activity: rows.map((a) => ({
      id: Number(a.id),
      type: a.type,
      summary: a.summary,
      actorId: Number(a.actor_id),
      actorName: a.display_name,
      actionText: activityActionText({ summary: a.summary, actorName: a.display_name, data: a.data }),
      createdAt: a.created_at,
    })),
  });
});
