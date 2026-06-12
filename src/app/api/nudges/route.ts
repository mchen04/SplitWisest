import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { canNudgeUser } from "@/lib/relationships";

// Reminders the caller has received (newest first). Drives the "settle up"
// nudge notifications.
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`
    SELECT n.id, n.from_id, n.group_id, n.note, n.seen_at, n.created_at,
      u.display_name AS from_name, g.name AS group_name
    FROM nudges n
    JOIN users u ON u.id = n.from_id
    LEFT JOIN groups g ON g.id = n.group_id
    WHERE n.to_id = ${user.id}
    ORDER BY n.id DESC LIMIT 50`;
  return NextResponse.json({
    nudges: rows.map((n) => ({
      id: Number(n.id),
      fromId: Number(n.from_id),
      fromName: n.from_name,
      groupId: n.group_id ? Number(n.group_id) : null,
      groupName: n.group_name,
      note: n.note,
      seen: n.seen_at !== null,
      createdAt: n.created_at,
    })),
  });
});

const Body = z.object({
  toId: z.number().int().positive(),
  groupId: z.number().int().positive().nullable().optional(),
  note: z.string().trim().max(280).optional().default(""),
});

// Send a settle-up nudge. The recipient must be a friend or a co-member of the
// referenced group. Coalesces rapid repeats: an existing unseen nudge from the
// same sender (same group scope) is refreshed instead of duplicated.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { toId, groupId, note } = Body.parse(await req.json());
  if (toId === user.id) badRequest("You can't nudge yourself");

  if (!(await canNudgeUser(user.id, toId, groupId ?? null))) {
    forbidden(groupId ? "You can only nudge group members" : "You can only nudge friends");
  }

  const existing = await sql`
    SELECT id FROM nudges
    WHERE from_id = ${user.id} AND to_id = ${toId} AND seen_at IS NULL
      AND group_id IS NOT DISTINCT FROM ${groupId ?? null}`;
  if (existing.length > 0) {
    await sql`UPDATE nudges SET note = ${note}, created_at = now() WHERE id = ${existing[0].id}`;
    return NextResponse.json({ id: Number(existing[0].id) });
  }
  const rows = await sql`
    INSERT INTO nudges (from_id, to_id, group_id, note)
    VALUES (${user.id}, ${toId}, ${groupId ?? null}, ${note}) RETURNING id`;
  return NextResponse.json({ id: Number(rows[0].id) });
});
