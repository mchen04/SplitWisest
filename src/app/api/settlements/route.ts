import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { settlementFields, settlementSummary } from "@/lib/settlements";
import { canSettleDirectly } from "@/lib/relationships";

// History of direct (group-less) settlements involving the caller, optionally
// narrowed to a single friend. Group settlements are listed per-group instead.
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const friendIdParam = req.nextUrl.searchParams.get("friendId");
  const friendId = friendIdParam ? Number(friendIdParam) : null;
  const rows = await sql`
    SELECT s.id, s.payer_id, s.recipient_id, s.amount_cents, s.currency, s.settled_date, s.note,
      p.display_name AS payer_name, r.display_name AS recipient_name
    FROM settlements s
    JOIN users p ON p.id = s.payer_id JOIN users r ON r.id = s.recipient_id
    WHERE s.group_id IS NULL AND (s.payer_id = ${user.id} OR s.recipient_id = ${user.id})
      AND (${friendId}::bigint IS NULL OR s.payer_id = ${friendId} OR s.recipient_id = ${friendId})
    ORDER BY s.settled_date DESC, s.id DESC LIMIT 200`;
  return NextResponse.json({
    settlements: rows.map((s) => ({
      id: Number(s.id),
      payerId: Number(s.payer_id),
      recipientId: Number(s.recipient_id),
      payerName: s.payer_name,
      recipientName: s.recipient_name,
      amountCents: Number(s.amount_cents),
      currency: s.currency,
      date: s.settled_date,
      note: s.note,
    })),
  });
});

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
  if (!(await canSettleDirectly(user.id, body.friendId))) forbidden("You are not friends with this user");

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
    { settlementId: Number(rows[0].id), visibleUserIds: [String(payerId), String(recipientId)] },
    await settlementSummary(payerId, recipientId, body.amountCents, body.currency));
  return NextResponse.json({ id: Number(rows[0].id) });
});
