import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`
    SELECT id, name, icon, owner_id FROM categories
    WHERE owner_id IS NULL OR owner_id = ${user.id}
    ORDER BY owner_id NULLS FIRST, name`;
  return NextResponse.json({
    categories: rows.map((c) => ({
      id: Number(c.id),
      name: c.name,
      icon: c.icon,
      custom: c.owner_id !== null,
    })),
  });
});

const Body = z.object({ name: z.string().trim().min(1, "Name is required").max(40) });

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { name } = Body.parse(await req.json());
  const existing = await sql`
    SELECT 1 FROM categories WHERE (owner_id IS NULL OR owner_id = ${user.id}) AND lower(name) = lower(${name})`;
  if (existing.length > 0) badRequest("A category with that name already exists");
  const rows = await sql`
    INSERT INTO categories (name, icon, owner_id) VALUES (${name}, 'tag', ${user.id}) RETURNING id`;
  return NextResponse.json({ id: Number(rows[0].id), name, icon: "tag", custom: true });
});
