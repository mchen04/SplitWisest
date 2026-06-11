import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { hashPassword, createSession, setSessionCookie, newInviteCode } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

const Body = z.object({
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  displayName: z.string().trim().min(1, "Display name is required").max(50),
  inviteCode: z.string().trim().min(1, "Invite code is required"),
});

export const POST = handler(async (req: NextRequest) => {
  const { username, password, displayName, inviteCode } = Body.parse(await req.json());

  // The invite code must be either the app signup code or a friend's personal
  // code (which also creates the friendship).
  let inviterId: number | null = null;
  if (inviteCode !== process.env.SIGNUP_CODE) {
    const inviter = await sql`SELECT id FROM users WHERE invite_code = ${inviteCode}`;
    if (inviter.length === 0) badRequest("Invalid invite code");
    inviterId = Number(inviter[0].id);
  }

  const existing = await sql`SELECT 1 FROM users WHERE lower(username) = lower(${username})`;
  if (existing.length > 0) badRequest("That username is taken");

  const rows = await sql`
    INSERT INTO users (username, display_name, password_hash, invite_code)
    VALUES (${username.toLowerCase()}, ${displayName}, ${hashPassword(password)}, ${newInviteCode()})
    RETURNING id`;
  const userId = Number(rows[0].id);

  if (inviterId) {
    const [a, b] = inviterId < userId ? [inviterId, userId] : [userId, inviterId];
    await sql`INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b}) ON CONFLICT DO NOTHING`;
  }
  await logActivity(null, userId, "user.joined", `${displayName} joined SplitWisest`);

  const token = await createSession(userId);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
});
