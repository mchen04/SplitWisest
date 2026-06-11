import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { friendBalances } from "@/lib/balances";
import { logActivity } from "@/lib/activity";

export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`
    SELECT u.id, u.display_name, u.username
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ${user.id} THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ${user.id} OR f.user_b = ${user.id}
    ORDER BY u.display_name`;
  const balances = await friendBalances(user.id);
  const balanceByFriend = new Map(balances.map((b) => [b.friendId, b.netByCurrency]));
  return NextResponse.json({
    friends: rows.map((f) => ({
      id: Number(f.id),
      displayName: f.display_name,
      username: f.username,
      netByCurrency: balanceByFriend.get(Number(f.id)) ?? {},
    })),
    myInviteCode: user.inviteCode,
  });
});

const Body = z.object({ code: z.string().trim().min(1, "Invite code is required") });

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { code } = Body.parse(await req.json());
  const rows = await sql`SELECT id, display_name FROM users WHERE invite_code = ${code}`;
  if (rows.length === 0) badRequest("No user found for that invite code");
  const friendId = Number(rows[0].id);
  if (friendId === user.id) badRequest("That is your own invite code");
  const [a, b] = friendId < user.id ? [friendId, user.id] : [user.id, friendId];
  await sql`INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b}) ON CONFLICT DO NOTHING`;
  return NextResponse.json({ id: friendId, displayName: rows[0].display_name });
});

const DeleteBody = z.object({ friendId: z.number().int().positive() });

// Remove a friend. Blocked while you still owe each other money (in any shared
// group or via direct settlements) so the relationship can't hide a live debt.
export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { friendId } = DeleteBody.parse(await req.json());
  const [a, b] = friendId < user.id ? [friendId, user.id] : [user.id, friendId];
  const existing = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  if (existing.length === 0) notFound("You are not friends with this user");

  const balances = await friendBalances(user.id);
  const fb = balances.find((x) => x.friendId === friendId);
  if (fb && Object.keys(fb.netByCurrency).length > 0) {
    badRequest("Settle up with this friend before removing them");
  }

  await sql`DELETE FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  await logActivity(null, user.id, "friend.removed", `${user.displayName} removed a friend`);
  return NextResponse.json({ ok: true });
});
