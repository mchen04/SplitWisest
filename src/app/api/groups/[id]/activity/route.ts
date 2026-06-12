import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const rows = await sql`
    SELECT a.id, a.type, a.summary, a.created_at, a.actor_id, u.display_name
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
      createdAt: a.created_at,
    })),
  });
});
