import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { hashPassword, createSession, setSessionCookie, newInviteCode } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { createFriendship } from "@/lib/relationships";

const Body = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1, "Display name is required").max(50),
  inviteCode: z.string().trim().optional().default(""),
});

export const POST = handler(async (req: NextRequest) => {
  const { username, password, displayName, inviteCode } = Body.parse(await req.json());

  // The invite code is optional. If provided it must be the app signup code,
  // a friend's personal code (creates the friendship), or a group's invite
  // code (joins that group and friends its members).
  let inviterId: number | null = null;
  let joinGroupId: number | null = null;
  if (inviteCode && inviteCode !== process.env.SIGNUP_CODE) {
    const inviter = await sql`SELECT id FROM users WHERE invite_code = ${inviteCode}`;
    if (inviter.length > 0) {
      inviterId = Number(inviter[0].id);
    } else {
      const group = await sql`SELECT id FROM groups WHERE invite_code = ${inviteCode}`;
      if (group.length === 0) badRequest("Invalid invite code");
      joinGroupId = Number(group[0].id);
    }
  }

  const existing = await sql`SELECT 1 FROM users WHERE lower(username) = lower(${username})`;
  if (existing.length > 0) badRequest("That username is taken");

  const rows = await sql`
    INSERT INTO users (username, display_name, password_hash, invite_code)
    VALUES (${username.toLowerCase()}, ${displayName}, ${hashPassword(password)}, ${newInviteCode()})
    RETURNING id`;
  const userId = Number(rows[0].id);

  if (inviterId) {
    await createFriendship(inviterId, userId);
  }
  if (joinGroupId) {
    await sql`INSERT INTO group_members (group_id, user_id) VALUES (${joinGroupId}, ${userId}) ON CONFLICT DO NOTHING`;
    const members = await sql`SELECT user_id FROM group_members WHERE group_id = ${joinGroupId} AND user_id <> ${userId}`;
    for (const m of members) {
      const other = Number(m.user_id);
      await createFriendship(other, userId);
    }
    await logActivity(joinGroupId, userId, "group.joined", `${displayName} joined the group`);
  }
  await logActivity(null, userId, "user.joined", `${displayName} joined SplitWisest`);

  const token = await createSession(userId);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
});
