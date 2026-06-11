import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser } from "@/lib/auth";

// Mark a scope read up to `lastId`. Scopes: 'activity', 'msg:group:<id>',
// 'msg:dm:<friendId>'. The marker only ever moves forward.
const Body = z.object({
  scope: z.string().trim().regex(/^(activity|msg:(group|dm):\d+)$/, "Invalid scope"),
  lastId: z.number().int().nonnegative(),
});

export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { scope, lastId } = Body.parse(await req.json());
  await sql`
    INSERT INTO read_state (user_id, scope, last_id, updated_at)
    VALUES (${user.id}, ${scope}, ${lastId}, now())
    ON CONFLICT (user_id, scope) DO UPDATE
      SET last_id = GREATEST(read_state.last_id, ${lastId}), updated_at = now()`;
  return NextResponse.json({ ok: true });
});
