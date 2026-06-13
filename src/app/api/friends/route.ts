import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { friendBalances } from "@/lib/balances";
import { assertAuthRateLimit, clearAuthRateLimit } from "@/lib/rate-limit";
import {
  canRequestFriendById,
  removeFriendshipWithActivity,
  requestOrAcceptFriendship,
} from "@/lib/relationships";

export const GET = handler(async () => {
  const user = await requireUser();
  // These four reads only depend on user.id and are mutually independent —
  // run them as a single parallel level rather than four serial round-trips.
  // (Pending requests in both directions let the UI show accept/decline on
  // incoming and a "requested" state on outgoing.)
  const [rows, balances, incoming, outgoing] = await Promise.all([
    sql`
    SELECT u.id, u.display_name, u.username,
      (SELECT COALESCE(MAX(m.id), 0) FROM messages m
        WHERE m.channel = 'dm'
          AND m.sender_id <> ${user.id}
          AND m.dm_a = LEAST(u.id, ${user.id})
          AND m.dm_b = GREATEST(u.id, ${user.id})) AS last_message_id,
      COALESCE((SELECT rs.last_id FROM read_state rs
        WHERE rs.user_id = ${user.id} AND rs.scope = 'msg:dm:' || u.id), 0) AS read_message_id
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ${user.id} THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ${user.id} OR f.user_b = ${user.id}
    ORDER BY u.display_name`,
    friendBalances(user.id),
    sql`
    SELECT fr.id, u.id AS user_id, u.display_name, u.username, fr.created_at
    FROM friend_requests fr JOIN users u ON u.id = fr.from_id
    WHERE fr.to_id = ${user.id} ORDER BY fr.id DESC`,
    sql`
    SELECT fr.id, u.id AS user_id, u.display_name, u.username, fr.created_at
    FROM friend_requests fr JOIN users u ON u.id = fr.to_id
    WHERE fr.from_id = ${user.id} ORDER BY fr.id DESC`,
  ]);
  const balanceByFriend = new Map(balances.map((b) => [b.friendId, b.netByCurrency]));

  return NextResponse.json({
    friends: rows.map((f) => ({
      id: Number(f.id),
      displayName: f.display_name,
      username: f.username,
      netByCurrency: balanceByFriend.get(Number(f.id)) ?? {},
      canRemoveFriend: Object.keys(balanceByFriend.get(Number(f.id)) ?? {}).length === 0,
      unreadMessages: Number(f.last_message_id) > Number(f.read_message_id) ? 1 : 0,
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

const Body = z.object({
  code: z.string().trim().optional(),
  userId: z.number().int().positive().optional(),
}).refine((v) => !!v.code || !!v.userId, "Invite code or user is required");

// Adding a friend by code sends a pending request the recipient must accept,
// rather than creating an instant friendship. If the other person already has a
// pending request out to you, this accepts it (mutual intent → friends).
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { code, userId } = Body.parse(await req.json());
  if (code) await assertAuthRateLimit(req, "invite", code);
  const rows = userId
    ? await sql`SELECT id, display_name FROM users WHERE id = ${userId}`
    : await sql`SELECT id, display_name FROM users WHERE invite_code = ${code}`;
  if (rows.length === 0) badRequest("No user found for that invite code");
  if (code) await clearAuthRateLimit("invite", code);
  const friendId = Number(rows[0].id);
  if (friendId === user.id) badRequest("That is your own invite code");

  if (userId && !(await canRequestFriendById(user.id, friendId))) badRequest("Use an invite code to add this person");

  const status = await requestOrAcceptFriendship({
    actorId: user.id,
    actorName: user.displayName,
    friendId,
    friendName: rows[0].display_name,
    requireSharedGroup: !!userId,
  });
  if (status === "already-friends") badRequest("You are already friends");
  if (status === "shared-group-required") badRequest("Use an invite code to add this person");
  return NextResponse.json({ status, id: friendId, displayName: rows[0].display_name });
});

const DeleteBody = z.object({ friendId: z.number().int().positive() });

// Remove a friend. Blocked while you still owe each other money (in any shared
// group or via direct settlements) so the relationship can't hide a live debt.
export const DELETE = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { friendId } = DeleteBody.parse(await req.json());

  const result = await removeFriendshipWithActivity(user, friendId);
  if (!result.removed && result.hasBalance) {
    badRequest("Settle up with this friend before removing them");
  }
  return NextResponse.json({ ok: true });
});
