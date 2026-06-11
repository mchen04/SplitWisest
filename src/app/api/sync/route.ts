import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

// Lightweight polling cursor: returns the max activity and message ids visible
// to this user, plus unread counts derived from per-user read_state markers.
// Clients poll this and refetch the affected views when a cursor advances.
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`
    SELECT
      (SELECT COALESCE(MAX(a.id),0) FROM activity a
        WHERE a.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
           OR (a.group_id IS NULL AND a.actor_id = ${user.id})) AS act,
      (SELECT COALESCE(MAX(m.id),0) FROM messages m
        WHERE m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
           OR m.dm_a = ${user.id} OR m.dm_b = ${user.id}) AS msg`;
  const activityCursor = Number(rows[0].act);
  const messageCursor = Number(rows[0].msg);

  // Unread messages: count conversations whose newest message (from someone
  // else) is past this user's read marker for that conversation.
  const unread = await sql`
    WITH chans AS (
      SELECT 'msg:group:' || m.group_id AS scope, MAX(m.id) AS maxid
      FROM messages m
      WHERE m.channel = 'group' AND m.sender_id <> ${user.id}
        AND m.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
      GROUP BY m.group_id
      UNION ALL
      SELECT 'msg:dm:' || (CASE WHEN m.dm_a = ${user.id} THEN m.dm_b ELSE m.dm_a END) AS scope, MAX(m.id) AS maxid
      FROM messages m
      WHERE m.channel = 'dm' AND m.sender_id <> ${user.id}
        AND (m.dm_a = ${user.id} OR m.dm_b = ${user.id})
      GROUP BY 1
    )
    SELECT
      (SELECT COUNT(*) FROM chans c
        LEFT JOIN read_state r ON r.user_id = ${user.id} AND r.scope = c.scope
        WHERE c.maxid > COALESCE(r.last_id, 0))::int AS messages,
      (CASE WHEN ${activityCursor} >
        COALESCE((SELECT last_id FROM read_state WHERE user_id = ${user.id} AND scope = 'activity'), 0)
        THEN 1 ELSE 0 END) AS activity,
      (SELECT COUNT(*) FROM nudges WHERE to_id = ${user.id} AND seen_at IS NULL)::int AS nudges`;

  return NextResponse.json({
    activityCursor,
    messageCursor,
    unread: {
      messages: Number(unread[0].messages),
      activity: Number(unread[0].activity),
      nudges: Number(unread[0].nudges),
    },
  });
});
