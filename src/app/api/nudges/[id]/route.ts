import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

// Dismiss a received nudge (marks it seen so it stops counting as unread).
export const DELETE = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  await sql`UPDATE nudges SET seen_at = now() WHERE id = ${id} AND to_id = ${user.id} AND seen_at IS NULL`;
  return NextResponse.json({ ok: true });
});
