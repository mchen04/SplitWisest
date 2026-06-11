import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

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
