import { NextRequest } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";

type Ctx = { params: Promise<{ id: string }> };

function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();

  const rows = await sql`
    SELECT e.expense_date, e.title, e.amount_cents, e.currency, e.converted_cents,
      p.display_name AS payer, c.name AS category, e.split_method, e.notes,
      (SELECT string_agg(u.display_name || ': ' || (es.share_cents/100.0), '; ' ORDER BY u.display_name)
       FROM expense_shares es JOIN users u ON u.id = es.user_id WHERE es.expense_id = e.id) AS shares
    FROM expenses e
    JOIN users p ON p.id = e.payer_id
    LEFT JOIN categories c ON c.id = e.category_id
    WHERE e.group_id = ${groupId}
    ORDER BY e.expense_date, e.id`;
  const group = await sql`SELECT name, currency FROM groups WHERE id = ${groupId}`;

  const header = ["Date", "Title", "Amount", "Currency", `Amount (${group[0].currency})`, "Paid by", "Category", "Split", "Notes", "Shares"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.expense_date,
      csvCell(r.title),
      (Number(r.amount_cents) / 100).toFixed(2),
      r.currency,
      (Number(r.converted_cents) / 100).toFixed(2),
      csvCell(r.payer),
      csvCell(r.category ?? ""),
      r.split_method,
      csvCell(r.notes),
      csvCell(r.shares ?? ""),
    ].join(","));
  }
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${group[0].name.replace(/[^a-z0-9-_ ]/gi, "")}-expenses.csv"`,
    },
  });
});
