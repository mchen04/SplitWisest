import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { mapMessages } from "@/lib/messages";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const q = req.nextUrl.searchParams.get("q") || null;
  // With no cursor, return the NEWEST messages (not the oldest 500 ever).
  const rows = since > 0 || q
    ? await sql`
        SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.group_id = ${groupId} AND m.id > ${since}
          AND (${q}::text IS NULL OR m.body ILIKE '%' || ${q} || '%')
        ORDER BY m.id DESC LIMIT 200`
    : (
        await sql`
          SELECT * FROM (
            SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
            FROM messages m JOIN users u ON u.id = m.sender_id
            WHERE m.group_id = ${groupId}
            ORDER BY m.id DESC LIMIT 100
          ) sub ORDER BY id ASC`
      );
  return NextResponse.json({ messages: mapMessages(rows) });
});

const Body = z.object({ body: z.string().trim().min(1, "Message is empty").max(4000) });

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const groupId = Number((await params).id);
  if (!Number.isInteger(groupId)) notFound();
  if (!(await isGroupMember(groupId, user.id))) forbidden();
  const { body } = Body.parse(await req.json());
  const rows = await sql`
    INSERT INTO messages (channel, group_id, sender_id, body)
    VALUES ('group', ${groupId}, ${user.id}, ${body}) RETURNING id`;
  return NextResponse.json({ id: Number(rows[0].id) });
});
