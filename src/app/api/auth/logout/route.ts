import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { clearSession } from "@/lib/auth";

export const POST = handler(async () => {
  await clearSession();
  return NextResponse.json({ ok: true });
});
