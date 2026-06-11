import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

// Lightweight polling cursor: returns the max activity and message ids visible
// to this user. Clients poll this and refetch the affected views when a cursor
// advances. Cheap enough to call every few seconds.
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`
    SELECT
      (SELECT COALESCE(MAX(a.id),0) FROM activity a
        WHERE a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
           OR a.group_id IS NULL) AS act,
      (SELECT COALESCE(MAX(m.id),0) FROM messages m
        WHERE m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
           OR m.dm_a = ${user.id} OR m.dm_b = ${user.id}) AS msg`;
  return NextResponse.json({ activityCursor: Number(rows[0].act), messageCursor: Number(rows[0].msg) });
});
