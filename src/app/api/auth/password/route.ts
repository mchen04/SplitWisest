import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser, hashPassword, verifyPassword, revokeOtherSessions } from "@/lib/auth";

const Body = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// Change password. Requires the current password and re-hashes with scrypt.
// Other sessions are revoked; the caller's own session is preserved.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { currentPassword, newPassword } = Body.parse(await req.json());
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
  if (rows.length === 0 || !verifyPassword(currentPassword, rows[0].password_hash)) {
    badRequest("Current password is incorrect");
  }
  await sql`UPDATE users SET password_hash = ${hashPassword(newPassword)} WHERE id = ${user.id}`;
  await revokeOtherSessions(user.id);
  return NextResponse.json({ ok: true });
});
