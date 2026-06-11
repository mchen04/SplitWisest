import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { groupBalances, isGroupMember } from "@/lib/balances";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string; userId: string }> };

// Remove a member from a group (or leave it, when removing yourself). Allowed
// only when that member is settled up (net zero) so the ledger stays balanced;
// removing someone other than yourself is restricted to the group's creator.
export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const { id, userId } = await params;
  const groupId = Number(id);
  const targetId = Number(userId);
  if (!Number.isInteger(groupId) || !Number.isInteger(targetId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden("You are not a member of this group");
  if (!(await isGroupMember(groupId, targetId))) notFound("That person is not in this group");

  const groupRows = await sql`SELECT created_by, name FROM groups WHERE id = ${groupId}`;
  if (groupRows.length === 0) notFound();
  const isCreator = Number(groupRows[0].created_by) === user.id;
  const removingSelf = targetId === user.id;
  if (!removingSelf && !isCreator) forbidden("Only the group's creator can remove other members");
  if (removingSelf && isCreator) {
    badRequest("The group's creator can't leave — delete the group instead, or transfer it first");
  }

  const balances = await groupBalances(groupId);
  const target = balances.find((b) => b.userId === targetId);
  if (target && target.netCents !== 0) {
    badRequest(
      removingSelf
        ? "Settle up your balance in this group before leaving"
        : "That member still has an outstanding balance — settle it up first"
    );
  }

  await sql`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${targetId}`;
  await logActivity(
    groupId,
    user.id,
    "group.member_removed",
    removingSelf
      ? `${user.displayName} left the group`
      : `${user.displayName} removed a member from the group`
  );
  return NextResponse.json({ ok: true, left: removingSelf });
});
