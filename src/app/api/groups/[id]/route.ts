import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { groupBalances, suggestSettlements, isGroupMember } from "@/lib/balances";
import { materializeRecurring } from "@/lib/expenses";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden("You are not a member of this group");

  await materializeRecurring(groupId);

  const groupRows = await sql`SELECT id, name, currency, invite_code FROM groups WHERE id = ${groupId}`;
  if (groupRows.length === 0) notFound();
  const members = await sql`
    SELECT u.id, u.display_name, u.username FROM group_members gm
    JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ${groupId} ORDER BY u.display_name`;
  const balances = await groupBalances(groupId);
  const suggestions = suggestSettlements(balances);

  return NextResponse.json({
    group: {
      id: groupId,
      name: groupRows[0].name,
      currency: groupRows[0].currency,
      inviteCode: groupRows[0].invite_code,
    },
    members: members.map((m) => ({ id: Number(m.id), displayName: m.display_name, username: m.username })),
    balances,
    suggestions,
  });
});
