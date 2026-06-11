import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";

const Body = z.object({
  requestId: z.number().int().positive(),
  action: z.enum(["accept", "decline", "cancel"]),
});

// Respond to a friend request. Recipients accept/decline; senders cancel.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { requestId, action } = Body.parse(await req.json());
  const rows = await sql`SELECT from_id, to_id FROM friend_requests WHERE id = ${requestId}`;
  if (rows.length === 0) notFound("Request not found");
  const fromId = Number(rows[0].from_id);
  const toId = Number(rows[0].to_id);

  if (action === "cancel") {
    if (fromId !== user.id) forbidden("You can only cancel your own requests");
    await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
    return NextResponse.json({ ok: true });
  }

  // accept / decline are recipient-only
  if (toId !== user.id) forbidden("This request isn't addressed to you");
  if (action === "decline") {
    await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
    return NextResponse.json({ ok: true });
  }

  // accept
  const [a, b] = fromId < toId ? [fromId, toId] : [toId, fromId];
  const exists = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  if (exists.length > 0) {
    await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
    badRequest("You are already friends");
  }
  await sql`INSERT INTO friendships (user_a, user_b) VALUES (${a}, ${b}) ON CONFLICT DO NOTHING`;
  await sql`DELETE FROM friend_requests WHERE (from_id = ${fromId} AND to_id = ${toId}) OR (from_id = ${toId} AND to_id = ${fromId})`;
  await logActivity(null, user.id, "friend.added", `${user.displayName} accepted a friend request`);
  return NextResponse.json({ ok: true });
});
