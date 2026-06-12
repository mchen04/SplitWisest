import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { assertAuthRateLimit, clearAuthRateLimit } from "@/lib/rate-limit";
import { joinGroupAndFriendMembers } from "@/lib/relationships";

const Body = z.object({ code: z.string().trim().min(1, "Invite code is required") });

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { code } = Body.parse(await req.json());
  await assertAuthRateLimit(req, "invite", code);
  const rows = await sql`SELECT id, name FROM groups WHERE invite_code = ${code}`;
  if (rows.length === 0) badRequest("No group found for that invite code");
  await clearAuthRateLimit("invite", code);
  const groupId = Number(rows[0].id);
  const existing = await sql`SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${user.id}`;
  if (existing.length > 0) return NextResponse.json({ id: groupId, alreadyMember: true });
  if (!(await joinGroupAndFriendMembers(groupId, user))) badRequest("No group found for that invite code");
  return NextResponse.json({ id: groupId });
});
