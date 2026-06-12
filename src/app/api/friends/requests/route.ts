import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handler, badRequest, notFound } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { acceptFriendRequestWithActivity, cancelFriendRequest, declineFriendRequest } from "@/lib/relationships";

const Body = z.object({
  requestId: z.number().int().positive(),
  action: z.enum(["accept", "decline", "cancel"]),
});

// Respond to a friend request. Recipients accept/decline; senders cancel.
export const POST = handler(async (req: NextRequest) => {
  const user = await requireUser();
  const { requestId, action } = Body.parse(await req.json());

  if (action === "cancel") {
    if (!(await cancelFriendRequest(requestId, user.id))) notFound("Request not found");
    return NextResponse.json({ ok: true });
  }

  if (action === "decline") {
    if (!(await declineFriendRequest(requestId, user.id))) notFound("Request not found");
    return NextResponse.json({ ok: true });
  }

  const result = await acceptFriendRequestWithActivity({
    requestId,
    actorId: user.id,
    actorName: user.displayName,
  });
  if (result === "missing") notFound("Request not found");
  if (result === "already-friends") badRequest("You are already friends");
  return NextResponse.json({ ok: true });
});
