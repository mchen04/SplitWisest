import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { ExpenseBody, insertExpense } from "@/lib/expenses";
import { logActivity } from "@/lib/activity";
import { fmtMoney } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();

  const q = req.nextUrl.searchParams;
  const text = q.get("q") || null;
  const categoryId = q.get("categoryId") ? Number(q.get("categoryId")) : null;
  const payerId = q.get("payerId") ? Number(q.get("payerId")) : null;
  const from = q.get("from") || null;
  const to = q.get("to") || null;

  const rows = await sql`
    SELECT e.id, e.title, e.amount_cents, e.currency, e.converted_cents, e.expense_date,
      e.payer_id, e.category_id, e.notes, e.split_method, e.created_at, e.updated_at,
      p.display_name AS payer_name, c.name AS category_name, c.icon AS category_icon,
      (SELECT COUNT(*) FROM attachments a WHERE a.expense_id = e.id) AS attachment_count,
      (SELECT json_agg(json_build_object('userId', es.user_id, 'shareCents', es.share_cents,
        'convertedShareCents', CASE WHEN e.amount_cents = 0 THEN 0
          ELSE ROUND(es.share_cents::numeric * e.converted_cents / e.amount_cents) END))
        FROM expense_shares es WHERE es.expense_id = e.id) AS shares
    FROM expenses e
    JOIN users p ON p.id = e.payer_id
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.group_id = ${groupId}
      AND (${text}::text IS NULL OR e.title ILIKE '%' || ${text} || '%' OR e.notes ILIKE '%' || ${text} || '%')
      AND (${categoryId}::bigint IS NULL OR e.category_id = ${categoryId})
      AND (${payerId}::bigint IS NULL OR e.payer_id = ${payerId})
      AND (${from}::date IS NULL OR e.expense_date >= ${from}::date)
      AND (${to}::date IS NULL OR e.expense_date <= ${to}::date)
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 500`;

  return NextResponse.json({
    expenses: rows.map((e) => ({
      id: Number(e.id),
      title: e.title,
      amountCents: Number(e.amount_cents),
      currency: e.currency,
      convertedCents: Number(e.converted_cents),
      date: e.expense_date,
      payerId: Number(e.payer_id),
      payerName: e.payer_name,
      categoryId: e.category_id ? Number(e.category_id) : null,
      categoryName: e.category_name,
      categoryIcon: e.category_icon,
      notes: e.notes,
      splitMethod: e.split_method,
      attachmentCount: Number(e.attachment_count),
      shares: e.shares ?? [],
    })),
  });
});

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();

  const input = ExpenseBody.parse(await req.json());
  const group = await sql`SELECT currency FROM groups WHERE id = ${groupId}`;
  const expenseId = await insertExpense(groupId, group[0].currency, user.id, input);
  await logActivity(groupId, user.id, "expense.added",
    `${user.displayName} added "${input.title}" (${fmtMoney(input.amountCents, input.currency)})`,
    { expenseId });
  return NextResponse.json({ id: expenseId });
});
