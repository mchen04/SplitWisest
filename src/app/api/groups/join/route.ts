import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createFriendship } from "@/lib/relationships";

const Body = z.object({ code: z.string().trim().min(1, "Invite code is required") });

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { code } = Body.parse(await req.json());
  const rows = await sql`SELECT id, name FROM groups WHERE invite_code = ${code}`;
  if (rows.length === 0) badRequest("No group found for that invite code");
  const groupId = Number(rows[0].id);
  const existing = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${user.id}`;
  if (existing.length > 0) return NextResponse.json({ id: groupId, alreadyMember: true });
  await sql`INSERT INTO group_members (group_id, user_id) VALUES (${groupId}, ${user.id})`;
  // joining a group makes everyone in it friends
  const members = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId} AND user_id <> ${user.id}`;
  for (const m of members) {
    const other = Number(m.user_id);
    await createFriendship(other, user.id);
  }
  await logActivity(groupId, user.id, "group.joined", `${user.displayName} joined the group`);
  return NextResponse.json({ id: groupId });
});
