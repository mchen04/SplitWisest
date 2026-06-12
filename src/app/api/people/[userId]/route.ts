import { NextRequest, NextResponse } from "next/server";
import { handler, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { loadPersonProfile } from "@/lib/people";

type Ctx = { params: Promise<{ userId: string }> };

export const GET = handler(async (_req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const personId = Number((await params).userId);
  if (!Number.isInteger(personId)) notFound();

  const profile = await loadPersonProfile(user.id, personId);
  if (!profile) notFound("Profile not available");

  return NextResponse.json({ profile });
});
