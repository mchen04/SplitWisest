import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { logActivity } from "@/lib/activity";
import { formatMoney } from "@/lib/money";
import { convert, CURRENCIES } from "@/lib/fx";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  payerId: z.number().int().positive(),
  recipientId: z.number().int().positive(),
  amountCents: z.number().int().positive("Amount must be positive").max(100_000_000_000),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  note: z.string().max(500).default(""),
});

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const rows = await sql`
    SELECT s.id, s.payer_id, s.recipient_id, s.amount_cents, s.currency, s.converted_cents,
      s.settled_date, s.note, p.display_name AS payer_name, r.display_name AS recipient_name
    FROM settlements s
    JOIN users p ON p.id = s.payer_id JOIN users r ON r.id = s.recipient_id
    WHERE s.group_id = ${groupId} ORDER BY s.settled_date DESC, s.id DESC LIMIT 200`;
  return NextResponse.json({
    settlements: rows.map((s) => ({
      id: Number(s.id),
      payerId: Number(s.payer_id),
      recipientId: Number(s.recipient_id),
      payerName: s.payer_name,
      recipientName: s.recipient_name,
      amountCents: Number(s.amount_cents),
      currency: s.currency,
      convertedCents: Number(s.converted_cents),
      date: s.settled_date,
      note: s.note,
    })),
  });
});

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const body = Body.parse(await req.json());
  if (body.payerId === body.recipientId) badRequest("Payer and recipient must be different");
  if (!(await isGroupMember(groupId, body.payerId)) || !(await isGroupMember(groupId, body.recipientId))) {
    badRequest("Both people must be group members");
  }
  const group = await sql`SELECT currency FROM groups WHERE id = ${groupId}`;
  const { cents: convertedCents } = await convert(body.amountCents, body.currency, group[0].currency);
  const rows = await sql`
    INSERT INTO settlements (group_id, payer_id, recipient_id, amount_cents, currency, converted_cents, settled_date, note, created_by)
    VALUES (${groupId}, ${body.payerId}, ${body.recipientId}, ${body.amountCents}, ${body.currency},
      ${convertedCents}, ${body.date}, ${body.note}, ${user.id})
    RETURNING id`;
  const names = await sql`SELECT id, display_name FROM users WHERE id IN (${body.payerId}, ${body.recipientId})`;
  const nameOf = (id: number) => names.find((n) => Number(n.id) === id)?.display_name ?? "Someone";
  await logActivity(groupId, user.id, "settlement.recorded",
    `${nameOf(body.payerId)} paid ${nameOf(body.recipientId)} ${formatMoney(body.amountCents, body.currency)} (recorded offline)`,
    { settlementId: Number(rows[0].id) });
  return NextResponse.json({ id: Number(rows[0].id) });
});
