import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { settlementFields, settlementSummary } from "@/lib/settlements";

// Direct (group-less) settlement between two friends.
const Body = z.object({
  friendId: z.number().int().positive(),
  direction: z.enum(["i-paid", "they-paid"]),
  ...settlementFields,
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const body = Body.parse(await req.json());
  if (body.friendId === user.id) badRequest("Cannot settle with yourself");
  const [a, b] = body.friendId < user.id ? [body.friendId, user.id] : [user.id, body.friendId];
  const friends = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  if (friends.length === 0) forbidden("You are not friends with this user");

  const payerId = body.direction === "i-paid" ? user.id : body.friendId;
  const recipientId = body.direction === "i-paid" ? body.friendId : user.id;
  // direct settlements have no group; keep the original currency as converted
  const rows = await sql`
    INSERT INTO settlements (group_id, payer_id, recipient_id, amount_cents, currency, converted_cents, settled_date, note, created_by)
    VALUES (NULL, ${payerId}, ${recipientId}, ${body.amountCents}, ${body.currency},
      ${body.amountCents}, ${body.date}, ${body.note}, ${user.id})
    RETURNING id`;
  await logActivity(null, user.id, "settlement.recorded",
    await settlementSummary(payerId, recipientId, body.amountCents, body.currency),
    { settlementId: Number(rows[0].id) });
  return NextResponse.json({ id: Number(rows[0].id) });
});
