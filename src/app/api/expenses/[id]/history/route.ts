import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { activityChanges } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const owner = await sql`SELECT group_id FROM expenses WHERE id = ${id}`;
  if (owner.length === 0) notFound("Expense not found");
  if (!(await isGroupMember(Number(owner[0].group_id), user.id))) forbidden();

  const rows = await sql`
    SELECT a.id, a.actor_id, a.created_at, a.data, u.display_name
    FROM activity a JOIN users u ON u.id = a.actor_id
    WHERE a.type = 'expense.edited'
      AND a.data->>'expenseId' = ${String(id)}
    ORDER BY a.id DESC
    LIMIT 50`;

  // Edits made before change detail was recorded carry no diff; they are left out
  // rather than rendered as an empty entry.
  const edits = rows
    .map((r) => ({
      id: Number(r.id),
      actorId: Number(r.actor_id),
      actorName: r.display_name as string,
      createdAt: r.created_at as string,
      changes: activityChanges(r.data),
    }))
    .filter((e) => e.changes.length > 0);

  return NextResponse.json({ edits });
});
