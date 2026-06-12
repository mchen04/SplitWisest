import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { groupBalances } from "@/lib/balances";
import { CURRENCIES } from "@/lib/fx";
import { createGroup } from "@/lib/groups";

export const GET = handler(async () => {
  const user = await requireUser();
  const groups = await sql`
    SELECT g.id, g.name, g.currency, g.invite_code,
      (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM expenses e WHERE e.group_id = g.id) AS expense_count,
      (SELECT COALESCE(MAX(m.id), 0) FROM messages m
        WHERE m.channel = 'group' AND m.group_id = g.id AND m.sender_id <> ${user.id}) AS last_message_id,
      COALESCE((SELECT rs.last_id FROM read_state rs
        WHERE rs.user_id = ${user.id} AND rs.scope = 'msg:group:' || g.id), 0) AS read_message_id
    FROM groups g JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ${user.id}
    ORDER BY g.created_at DESC`;
  const withBalances = await Promise.all(
    groups.map(async (g) => {
      const balances = await groupBalances(Number(g.id));
      const mine = balances.find((b) => b.userId === user.id);
      return {
        id: Number(g.id),
        name: g.name,
        currency: g.currency,
        inviteCode: g.invite_code,
        memberCount: Number(g.member_count),
        expenseCount: Number(g.expense_count),
        myNetCents: mine?.netCents ?? 0,
        unreadMessages: Number(g.last_message_id) > Number(g.read_message_id) ? 1 : 0,
      };
    })
  );
  return NextResponse.json({ groups: withBalances });
});

const CreateBody = z.object({
  name: z.string().trim().min(1, "Group name is required").max(60),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { name, currency } = CreateBody.parse(await req.json());
  const group = await createGroup(user, name, currency);
  return NextResponse.json({ id: group.id, inviteCode: group.inviteCode });
});
