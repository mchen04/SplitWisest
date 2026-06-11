import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

const Body = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const POST = handler(async (req: NextRequest) => {
  const { username, password } = Body.parse(await req.json());
  const rows = await sql`SELECT id, password_hash FROM users WHERE lower(username) = lower(${username})`;
  if (rows.length === 0 || !verifyPassword(password, rows[0].password_hash)) {
    badRequest("Incorrect username or password");
  }
  const token = await createSession(Number(rows[0].id));
  await setSessionCookie(token);
  return NextResponse.json({ ok: true });
});
