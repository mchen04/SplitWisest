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

  // Pending requests in both directions, so the UI can show accept/decline
  // (incoming) and a "requested" state (outgoing).
  const incoming = await sql`
    SELECT fr.id, u.id AS user_id, u.display_name, u.username, fr.created_at
    FROM friend_requests fr JOIN users u ON u.id = fr.from_id
    WHERE fr.to_id = ${user.id} ORDER BY fr.id DESC`;
  const outgoing = await sql`
    SELECT fr.id, u.id AS user_id, u.display_name, u.username, fr.created_at
    FROM friend_requests fr JOIN users u ON u.id = fr.to_id
    WHERE fr.from_id = ${user.id} ORDER BY fr.id DESC`;

  return NextResponse.json({
    friends: rows.map((f) => ({
      id: Number(f.id),
      displayName: f.display_name,
      username: f.username,
      netByCurrency: balanceByFriend.get(Number(f.id)) ?? {},
    })),
    incomingRequests: incoming.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      displayName: r.display_name,
      username: r.username,
      createdAt: r.created_at,
    })),
    outgoingRequests: outgoing.map((r) => ({
      id: Number(r.id),
      userId: Number(r.user_id),
      displayName: r.display_name,
      username: r.username,
      createdAt: r.created_at,
    })),
    myInviteCode: user.inviteCode,
  });
});

const Body = z.object({ code: z.string().trim().min(1, "Invite code is required") });

// Adding a friend by code sends a pending request the recipient must accept,
// rather than creating an instant friendship. If the other person already has a
// pending request out to you, this accepts it (mutual intent → friends).
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { code } = Body.parse(await req.json());
  const rows = await sql`SELECT id, display_name FROM users WHERE invite_code = ${code}`;
  if (rows.length === 0) badRequest("No user found for that invite code");
  const friendId = Number(rows[0].id);
  if (friendId === user.id) badRequest("That is your own invite code");

  const [a, b] = friendId < user.id ? [friendId, user.id] : [user.id, friendId];
  const already = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  if (already.length > 0) badRequest("You are already friends");

  // Reciprocal request waiting? Accept it.
  const reciprocal = await sql`
    SELECT id FROM friend_requests WHERE from_id = ${friendId} AND to_id = ${user.id}`;
  if (reciprocal.length > 0) {
    await sql`INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b}) ON CONFLICT DO NOTHING`;
    await sql`DELETE FROM friend_requests WHERE (from_id = ${friendId} AND to_id = ${user.id}) OR (from_id = ${user.id} AND to_id = ${friendId})`;
    await logActivity(null, user.id, "friend.added", `${user.displayName} and ${rows[0].display_name} are now friends`);
    return NextResponse.json({ status: "accepted", id: friendId, displayName: rows[0].display_name });
  }

  await sql`
    INSERT INTO friend_requests (from_id, to_id) VALUES (${user.id}, ${friendId})
    ON CONFLICT (from_id, to_id) DO NOTHING`;
  return NextResponse.json({ status: "requested", id: friendId, displayName: rows[0].display_name });
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
