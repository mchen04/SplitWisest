import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { mapMessages } from "@/lib/messages";

type Ctx = { params: Promise<{ friendId: string }> };

async function requireFriend(userId: number, friendId: number) {
  const [a, b] = userId < friendId ? [userId, friendId] : [friendId, userId];
  const rows = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  if (rows.length === 0) forbidden("You are not friends with this user");
  return [a, b] as const;
}

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const friendId = Number((await params).friendId);
  if (!Number.isInteger(friendId)) notFound();
  const [a, b] = await requireFriend(user.id, friendId);
  const since = Number(req.nextUrl.searchParams.get("since") ?? 0);
  const before = Number(req.nextUrl.searchParams.get("before") ?? 0);
  const q = req.nextUrl.searchParams.get("q") || null;

  if (before > 0) {
    const older = await sql`
      SELECT * FROM (
        SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.dm_a = ${a} AND m.dm_b = ${b} AND m.id < ${before}
        ORDER BY m.id DESC LIMIT 101
      ) sub ORDER BY id ASC`;
    const hasMore = older.length > 100;
    return NextResponse.json({ messages: mapMessages(hasMore ? older.slice(1) : older), hasMore });
  }
  if (since > 0 || q) {
    const rows = await sql`
      SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.dm_a = ${a} AND m.dm_b = ${b} AND m.id > ${since}
        AND (${q}::text IS NULL OR m.body ILIKE '%' || ${q} || '%')
      ORDER BY m.id DESC LIMIT 200`;
    return NextResponse.json({ messages: mapMessages(rows) });
  }
  const rows = await sql`
    SELECT * FROM (
      SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.dm_a = ${a} AND m.dm_b = ${b}
      ORDER BY m.id DESC LIMIT 101
    ) sub ORDER BY id ASC`;
  const hasMore = rows.length > 100;
  return NextResponse.json({ messages: mapMessages(hasMore ? rows.slice(1) : rows), hasMore });
});

const Body = z.object({ body: z.string().trim().min(1, "Message is empty").max(4000) });

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const friendId = Number((await params).friendId);
  if (!Number.isInteger(friendId)) notFound();
  const [a, b] = await requireFriend(user.id, friendId);
  const { body } = Body.parse(await req.json());
  const rows = await sql`
    INSERT INTO messages (channel, dm_a, dm_b, sender_id, body)
    VALUES ('dm', ${a}, ${b}, ${user.id}, ${body}) RETURNING id`;
  return NextResponse.json({ id: Number(rows[0].id) });
});
