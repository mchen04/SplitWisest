import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember, loadGroupMemberIds } from "@/lib/balances";
import { logActivity } from "@/lib/activity";
import { CURRENCIES } from "@/lib/fx";

type Ctx = { params: Promise<{ id: string }> };

const PatchBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  amountCents: z.number().int().positive().max(100_000_000_000),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
  payerId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  participantIds: z.array(z.number().int().positive()).min(1, "At least one participant"),
  notes: z.string().max(2000).default(""),
  cadence: z.enum(["weekly", "monthly"]),
  nextDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  active: z.boolean().default(true),
});

// Edit a recurring rule in place. Future materializations pick up the new
// values; expenses already generated from it are left untouched.
export const PATCH = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const rows = await sql`SELECT group_id FROM recurring_expenses WHERE id = ${id}`;
  if (rows.length === 0) notFound();
  const groupId = Number(rows[0].group_id);
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const body = PatchBody.parse(await req.json());
  const memberIds = await loadGroupMemberIds(groupId);
  if (!memberIds.has(body.payerId)) badRequest("Payer must be a group member");
  for (const pid of body.participantIds) if (!memberIds.has(pid)) badRequest("All participants must be group members");
  await sql`
    UPDATE recurring_expenses SET
      title = ${body.title}, amount_cents = ${body.amountCents}, currency = ${body.currency},
      payer_id = ${body.payerId}, category_id = ${body.categoryId ?? null},
      participant_ids = ${body.participantIds}, notes = ${body.notes}, cadence = ${body.cadence},
      next_date = ${body.nextDate}, anchor_day = ${Number(body.nextDate.slice(8, 10))}, active = ${body.active}
    WHERE id = ${id}`;
  await logActivity(groupId, user.id, "recurring.updated",
    `${user.displayName} updated the recurring expense "${body.title}"`);
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const rows = await sql`SELECT group_id, title FROM recurring_expenses WHERE id = ${id}`;
  if (rows.length === 0) notFound();
  if (!(await isGroupMember(Number(rows[0].group_id), user.id))) forbidden();
  await sql`UPDATE recurring_expenses SET active = false WHERE id = ${id}`;
  await logActivity(Number(rows[0].group_id), user.id, "recurring.stopped",
    `${user.displayName} stopped the recurring expense "${rows[0].title}"`);
  return NextResponse.json({ ok: true });
});
