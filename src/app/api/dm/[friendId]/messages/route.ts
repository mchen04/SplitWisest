import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handler, forbidden, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { insertDirectMessage, loadDirectMessages } from "@/lib/messages";
import { requireFriendship } from "@/lib/relationships";

type Ctx = { params: Promise<{ friendId: string }> };

export const GET = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const friendId = Number((await params).friendId);
  if (!Number.isInteger(friendId)) notFound();
  const [a, b] = await requireFriendship(user.id, friendId);
  return NextResponse.json(await loadDirectMessages(a, b, req.nextUrl.searchParams));
});

const Body = z.object({ body: z.string().trim().min(1, "Message is empty").max(4000) });

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const friendId = Number((await params).friendId);
  if (!Number.isInteger(friendId)) notFound();
  const { body } = Body.parse(await req.json());
  const id = await insertDirectMessage(user.id, friendId, body);
  if (id === null) forbidden("You are not friends with this user");
  return NextResponse.json({ id });
});
