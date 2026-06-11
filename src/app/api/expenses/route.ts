import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

// Cross-group expense search for the current user.
export const GET = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const q = req.nextUrl.searchParams;
  const text = q.get("q") || null;
  const groupId = q.get("groupId") ? Number(q.get("groupId")) : null;
  const categoryId = q.get("categoryId") ? Number(q.get("categoryId")) : null;
  const payerId = q.get("payerId") ? Number(q.get("payerId")) : null;
  const friendId = q.get("friendId") ? Number(q.get("friendId")) : null;
  const from = q.get("from") || null;
  const to = q.get("to") || null;

  const rows = await sql`
    SELECT e.id, e.group_id, g.name AS group_name, e.title, e.amount_cents, e.currency,
      e.converted_cents, e.expense_date, e.payer_id, p.display_name AS payer_name,
      c.name AS category_name, e.split_method
    FROM expenses e
    JOIN groups g ON g.id = e.group_id
    JOIN users p ON p.id = e.payer_id
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.group_id IN (SELECT group_id FROM group_members WHERE user_id = ${user.id})
      AND (${text}::text IS NULL OR e.title ILIKE '%' || ${text} || '%' OR e.notes ILIKE '%' || ${text} || '%')
      AND (${groupId}::bigint IS NULL OR e.group_id = ${groupId})
      AND (${categoryId}::bigint IS NULL OR e.category_id = ${categoryId})
      AND (${payerId}::bigint IS NULL OR e.payer_id = ${payerId})
      AND (${friendId}::bigint IS NULL OR EXISTS
        (SELECT 1 FROM expense_shares es WHERE es.expense_id = e.id AND es.user_id = ${friendId}))
      AND (${from}::date IS NULL OR e.expense_date >= ${from}::date)
      AND (${to}::date IS NULL OR e.expense_date <= ${to}::date)
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 300`;

  return NextResponse.json({
    expenses: rows.map((e) => ({
      id: Number(e.id),
      groupId: Number(e.group_id),
      groupName: e.group_name,
      title: e.title,
      amountCents: Number(e.amount_cents),
      currency: e.currency,
      convertedCents: Number(e.converted_cents),
      date: e.expense_date,
      payerId: Number(e.payer_id),
      payerName: e.payer_name,
      categoryName: e.category_name,
      splitMethod: e.split_method,
    })),
  });
});
