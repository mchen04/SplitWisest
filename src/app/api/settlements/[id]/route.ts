import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { logActivity } from "@/lib/activity";
import { settlementFields, settlementSummary } from "@/lib/settlements";
import { convert } from "@/lib/fx";

type Ctx = { params: Promise<{ id: string }> };

interface SettlementRow {
  id: number;
  group_id: number | null;
  payer_id: number;
  recipient_id: number;
  created_by: number;
}

// Load a settlement and confirm the caller may touch it: the group settlement's
// members, or — for a direct settlement — either party or whoever recorded it.
async function loadAuthorized(id: number, userId: number): Promise<SettlementRow> {
  if (!Number.isInteger(id)) notFound();
  const rows = await sql`SELECT id, group_id, payer_id, recipient_id, created_by FROM settlements WHERE id = ${id}`;
  if (rows.length === 0) notFound();
  const s = rows[0] as unknown as SettlementRow;
  const groupId = s.group_id === null ? null : Number(s.group_id);
  const allowed =
    Number(s.created_by) === userId ||
    Number(s.payer_id) === userId ||
    Number(s.recipient_id) === userId ||
    (groupId !== null && (await isGroupMember(groupId, userId)));
  if (!allowed) forbidden("You can't edit this settlement");
  return { ...s, group_id: groupId, payer_id: Number(s.payer_id), recipient_id: Number(s.recipient_id), id: Number(s.id) };
}

const PatchBody = z.object(settlementFields);

// Edit a recorded payment's amount, currency, date, or note. Payer and
// recipient stay fixed; converted_cents is recomputed for group settlements.
export const PATCH = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const s = await loadAuthorized(Number((await params).id), user.id);
  const body = PatchBody.parse(await req.json());

  let convertedCents = body.amountCents;
  if (s.group_id !== null) {
    const group = await sql`SELECT currency FROM groups WHERE id = ${s.group_id}`;
    if (group.length > 0) {
      convertedCents = (await convert(body.amountCents, body.currency, group[0].currency)).cents;
    }
  }
  await sql`
    UPDATE settlements SET amount_cents = ${body.amountCents}, currency = ${body.currency},
      converted_cents = ${convertedCents}, settled_date = ${body.date}, note = ${body.note}
    WHERE id = ${s.id}`;
  await logActivity(s.group_id, user.id, "settlement.updated",
    `${user.displayName} edited a recorded payment — now ${await settlementSummary(s.payer_id, s.recipient_id, body.amountCents, body.currency)}`);
  return NextResponse.json({ ok: true });
});

// Delete a recorded payment; balances recompute as if it never happened.
export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const s = await loadAuthorized(Number((await params).id), user.id);
  await sql`DELETE FROM settlements WHERE id = ${s.id}`;
  await logActivity(s.group_id, user.id, "settlement.deleted", `${user.displayName} deleted a recorded payment`);
  return NextResponse.json({ ok: true });
});
