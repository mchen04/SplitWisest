import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { ExpenseBody, updateExpense } from "@/lib/expenses";
import { logActivity } from "@/lib/activity";
import { formatMoney } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };

async function loadExpense(id: number, userId: number) {
  const rows = await sql`SELECT * FROM expenses WHERE id = ${id}`;
  if (rows.length === 0) notFound("Expense not found");
  const e = rows[0];
  if (!(await isGroupMember(Number(e.group_id), userId))) forbidden();
  return e;
}

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const e = await loadExpense(id, user.id);
  const shares = await sql`
    SELECT es.user_id, es.share_cents, es.raw_input, u.display_name
    FROM expense_shares es JOIN users u ON u.id = es.user_id WHERE es.expense_id = ${id}`;
  const items = await sql`SELECT id, name, amount_cents, participant_ids FROM expense_items WHERE expense_id = ${id} ORDER BY id`;
  const attachments = await sql`SELECT id, filename, mime FROM attachments WHERE expense_id = ${id} ORDER BY id`;
  return NextResponse.json({
    expense: {
      id,
      groupId: Number(e.group_id),
      title: e.title,
      amountCents: Number(e.amount_cents),
      currency: e.currency,
      convertedCents: Number(e.converted_cents),
      date: e.expense_date,
      payerId: Number(e.payer_id),
      categoryId: e.category_id ? Number(e.category_id) : null,
      notes: e.notes,
      splitMethod: e.split_method,
      shares: shares.map((s) => ({
        userId: Number(s.user_id),
        shareCents: Number(s.share_cents),
        rawInput: s.raw_input === null ? null : Number(s.raw_input),
        displayName: s.display_name,
      })),
      items: items.map((i) => ({
        id: Number(i.id),
        name: i.name,
        amountCents: Number(i.amount_cents),
        participantIds: (i.participant_ids as number[]).map(Number),
      })),
      attachments: attachments.map((a) => ({ id: Number(a.id), filename: a.filename, mime: a.mime })),
    },
  });
});

export const PATCH = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const e = await loadExpense(id, user.id);
  const input = ExpenseBody.parse(await req.json());
  const group = await sql`SELECT currency FROM groups WHERE id = ${e.group_id}`;
  await updateExpense(id, Number(e.group_id), group[0].currency, user.id, input, {
    amountCents: Number(e.amount_cents),
    currency: e.currency,
    convertedCents: Number(e.converted_cents),
    fxRate: Number(e.fx_rate),
  });
  await logActivity(Number(e.group_id), user.id, "expense.edited",
    `${user.displayName} edited "${input.title}" (${formatMoney(input.amountCents, input.currency)})`,
    { expenseId: id });
  return NextResponse.json({ ok: true });
});

export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const e = await loadExpense(id, user.id);
  await sql`DELETE FROM expenses WHERE id = ${id}`;
  await logActivity(Number(e.group_id), user.id, "expense.deleted",
    `${user.displayName} deleted "${e.title}" (${formatMoney(Number(e.amount_cents), e.currency)})`);
  return NextResponse.json({ ok: true });
});
