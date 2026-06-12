import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { logActivity, logUserActivity } from "@/lib/activity";
import { loadAuthorizedSettlementForMutation, settlementFields, settlementSummary } from "@/lib/settlements";
import { convert } from "@/lib/fx";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z.object(settlementFields);

// Edit a recorded payment's amount, currency, date, or note. Payer and
// recipient stay fixed; converted_cents is recomputed for group settlements.
export const PATCH = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const s = await loadAuthorizedSettlementForMutation(Number((await params).id), user.id);
  const body = PatchBody.parse(await req.json());

  let convertedCents = body.amountCents;
  if (s.groupId !== null) {
    const group = await sql`SELECT currency FROM groups WHERE id = ${s.groupId}`;
    if (group.length > 0) {
      convertedCents = (await convert(body.amountCents, body.currency, group[0].currency)).cents;
    }
  }
  await sql`
    UPDATE settlements SET amount_cents = ${body.amountCents}, currency = ${body.currency},
      converted_cents = ${convertedCents}, settled_date = ${body.date}, note = ${body.note}
    WHERE id = ${s.id}`;
  const summary = `${user.displayName} edited a recorded payment — now ${await settlementSummary(s.payerId, s.recipientId, body.amountCents, body.currency)}`;
  if (s.groupId === null) {
    await logUserActivity({
      actorId: user.id,
      visibleUserIds: [s.payerId, s.recipientId],
      type: "settlement.updated",
      summary,
    });
  } else {
    await logActivity(s.groupId, user.id, "settlement.updated", summary);
  }
  return NextResponse.json({ ok: true });
});

// Delete a recorded payment; balances recompute as if it never happened.
export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const s = await loadAuthorizedSettlementForMutation(Number((await params).id), user.id);
  await sql`DELETE FROM settlements WHERE id = ${s.id}`;
  const summary = `${user.displayName} deleted a recorded payment`;
  if (s.groupId === null) {
    await logUserActivity({
      actorId: user.id,
      visibleUserIds: [s.payerId, s.recipientId],
      type: "settlement.deleted",
      summary,
    });
  } else {
    await logActivity(s.groupId, user.id, "settlement.deleted", summary);
  }
  return NextResponse.json({ ok: true });
});
