import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser, newRecoveryCode, hashRecoveryCode } from "@/lib/auth";

const CODE_COUNT = 8;

// How many unused recovery codes the caller has left.
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${user.id} AND used_at IS NULL`;
  return NextResponse.json({ remaining: rows[0].n });
});

// Regenerate the full set. Invalidates any prior codes and returns the fresh
// plaintext codes ONCE — they are never retrievable again.
export const POST = handler(async () => {
  const user = await requireUser();
  await sql`DELETE FROM recovery_codes WHERE user_id = ${user.id}`;
  const codes = Array.from({ length: CODE_COUNT }, () => newRecoveryCode());
  for (const code of codes) {
    await sql`INSERT INTO recovery_codes (user_id, code_hash) VALUES (${user.id}, ${hashRecoveryCode(code)})`;
  }
  return NextResponse.json({ codes });
});
