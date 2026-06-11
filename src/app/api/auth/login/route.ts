import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

// Hash of a random throwaway password, used to equalize timing for unknown users.
const DUMMY_HASH =
  "scrypt:0123456789abcdef0123456789abcdef:" + "ab".repeat(64);

const Body = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const POST = handler(async (req: NextRequest) => {
  const { username, password } = Body.parse(await req.json());
  const rows = await sql`SELECT id, password_hash FROM users WHERE lower(username) = lower(${username})`;
  // Always run the scrypt comparison so unknown usernames take the same time
  // as wrong passwords (prevents username enumeration via timing).
  const hash = rows.length > 0 ? rows[0].password_hash : DUMMY_HASH;
  const ok = verifyPassword(password, hash) && rows.length > 0;
  if (!ok) badRequest("Incorrect username or password");
  const token = await createSession(Number(rows[0].id));
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
});
