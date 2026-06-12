import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import {
  hashPassword,
  verifyRecoveryCode,
  createSession,
  setSessionCookie,
} from "@/lib/auth";

const Body = z.object({
  username: z.string().trim().min(1, "Username is required"),
  code: z.string().trim().min(1, "Recovery code is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// Regain access with a one-time recovery code. Verifies the code, resets the
// password, consumes that single code, and logs the user in.
export const POST = handler(async (req: NextRequest) => {
  const { username, code, newPassword } = Body.parse(await req.json());
  const users = await sql`SELECT id FROM users WHERE lower(username) = lower(${username})`;
  if (users.length === 0) badRequest("Invalid username or recovery code");
  const userId = Number(users[0].id);

  const codes = await sql`
    SELECT id, code_hash FROM recovery_codes
    WHERE user_id = ${userId} AND used_at IS NULL`;
  const match = codes.find((c) => verifyRecoveryCode(code, c.code_hash));
  if (!match) badRequest("Invalid username or recovery code");

  const consumed = await sql`
    UPDATE recovery_codes SET used_at = now()
    WHERE id = ${match.id} AND used_at IS NULL
    RETURNING id`;
  if (consumed.length === 0) badRequest("Invalid username or recovery code");

  await sql`UPDATE users SET password_hash = ${hashPassword(newPassword)} WHERE id = ${userId}`;
  // Invalidate existing sessions so a thief who knew the old password is kicked.
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;

  const token = await createSession(userId);
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
});
