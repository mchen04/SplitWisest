import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "@/lib/db";
import { handler, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const GET = handler(async () => {
  const user = await requireUser();
  return NextResponse.json({ user });
});

const PatchBody = z.object({
  displayName: z.string().trim().min(1, "Display name is required").max(50),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-z0-9_]+$/i, "Username can only contain letters, numbers, and underscores"),
});

// Update the caller's display name and username (username uniqueness enforced).
export const PATCH = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { displayName, username } = PatchBody.parse(await req.json());
  const taken = await sql`
    SELECT 1 FROM users WHERE lower(username) = lower(${username}) AND id <> ${user.id}`;
  if (taken.length > 0) badRequest("That username is taken");
  await sql`
    UPDATE users SET display_name = ${displayName}, username = ${username.toLowerCase()}
    WHERE id = ${user.id}`;
  return NextResponse.json({
    user: { ...user, displayName, username: username.toLowerCase() },
  });
});
