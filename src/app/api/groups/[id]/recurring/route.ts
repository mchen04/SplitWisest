import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember, loadGroupMemberIds } from "@/lib/balances";
import { logActivity } from "@/lib/activity";
import { CURRENCIES } from "@/lib/fx";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const rows = await sql`
    SELECT r.*, u.display_name AS payer_name, c.name AS category_name
    FROM recurring_expenses r
    JOIN users u ON u.id = r.payer_id
    LEFT JOIN categories c ON c.id = r.category_id
    WHERE r.group_id = ${groupId} ORDER BY r.id`;
  return NextResponse.json({
    recurring: rows.map((r) => ({
      id: Number(r.id),
      title: r.title,
      amountCents: Number(r.amount_cents),
      currency: r.currency,
      payerId: Number(r.payer_id),
      payerName: r.payer_name,
      categoryId: r.category_id ? Number(r.category_id) : null,
      categoryName: r.category_name,
      participantIds: (r.participant_ids as number[]).map(Number),
      cadence: r.cadence,
      nextDate: r.next_date,
      active: r.active,
    })),
  });
});

const Body = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  amountCents: z.number().int().positive().max(100_000_000_000),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
  payerId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  participantIds: z.array(z.number().int().positive()).min(1, "At least one participant"),
  notes: z.string().max(2000).default(""),
  cadence: z.enum(["weekly", "monthly"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
});

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const body = Body.parse(await req.json());
  const memberIds = await loadGroupMemberIds(groupId);
  if (!memberIds.has(body.payerId)) badRequest("Payer must be a group member");
  for (const pid of body.participantIds) if (!memberIds.has(pid)) badRequest("All participants must be group members");
  const rows = await sql`
    INSERT INTO recurring_expenses (group_id, title, amount_cents, currency, payer_id, category_id,
      participant_ids, notes, cadence, next_date, anchor_day, created_by)
    VALUES (${groupId}, ${body.title}, ${body.amountCents}, ${body.currency}, ${body.payerId},
      ${body.categoryId ?? null}, ${body.participantIds}, ${body.notes}, ${body.cadence},
      ${body.startDate}, ${Number(body.startDate.slice(8, 10))}, ${user.id})
    RETURNING id`;
  await logActivity(groupId, user.id, "recurring.created",
    `${user.displayName} set up a ${body.cadence} recurring expense "${body.title}"`);
  return NextResponse.json({ id: Number(rows[0].id) });
});
