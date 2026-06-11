import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { groupBalances, suggestSettlements, isGroupMember } from "@/lib/balances";
import { materializeRecurring } from "@/lib/expenses";
import { logActivity } from "@/lib/activity";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden("You are not a member of this group");

  await materializeRecurring(groupId);

  const groupRows = await sql`SELECT id, name, currency, invite_code, created_by FROM groups WHERE id = ${groupId}`;
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
      createdBy: Number(groupRows[0].created_by),
    },
    members: members.map((m) => ({ id: Number(m.id), displayName: m.display_name, username: m.username })),
    balances,
    suggestions,
  });
});

const PatchBody = z.object({ name: z.string().trim().min(1, "Group name is required").max(60) });

// Rename a group. Any member may rename it; currency is immutable because
// existing expenses store amounts already converted to the group's currency.
export const PATCH = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden("You are not a member of this group");
  const { name } = PatchBody.parse(await req.json());
  const rows = await sql`UPDATE groups SET name = ${name} WHERE id = ${groupId} RETURNING id`;
  if (rows.length === 0) notFound();
  await logActivity(groupId, user.id, "group.renamed", `${user.displayName} renamed the group to "${name}"`);
  return NextResponse.json({ ok: true });
});

// Delete a group and everything in it. Restricted to the group's creator;
// ON DELETE CASCADE removes members, expenses, shares, settlements, messages,
// recurring rules, and group activity.
export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  const rows = await sql`SELECT created_by FROM groups WHERE id = ${groupId}`;
  if (rows.length === 0) notFound();
  if (Number(rows[0].created_by) !== user.id) forbidden("Only the group's creator can delete it");
  await sql`DELETE FROM groups WHERE id = ${groupId}`;
  return NextResponse.json({ ok: true });
});
