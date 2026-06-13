import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireUser, newRecoveryCode, hashRecoveryCode } from "@/lib/auth";
import { assertAuthRateLimit } from "@/lib/rate-limit";

const CODE_COUNT = 8;

// How many unused recovery codes the caller has left.
export const GET = handler(async () => {
  const user = await requireUser();
  const rows = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${user.id} AND used_at IS NULL`;
  return NextResponse.json({ remaining: rows[0].n });
});

// Regenerate the full set. Invalidates any prior codes and returns the fresh
// plaintext codes ONCE — they are never retrievable again.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  // Cap regeneration so an attacker holding a session can't spam-rotate (and thus
  // invalidate) the victim's printed recovery codes (keyed on user id).
  await assertAuthRateLimit(req, "recovery", String(user.id));
  const codes = Array.from({ length: CODE_COUNT }, () => newRecoveryCode());
  const rows = codes.map((code) => ({ code_hash: hashRecoveryCode(code) }));
  await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(${user.id}::int)`,
    tx`DELETE FROM recovery_codes WHERE user_id = ${user.id}`,
    tx`
      INSERT INTO recovery_codes (user_id, code_hash)
      SELECT ${user.id}, x.code_hash
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(code_hash text)`,
  ]);
  return NextResponse.json({ codes });
});
