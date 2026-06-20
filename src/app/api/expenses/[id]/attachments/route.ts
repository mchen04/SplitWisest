import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { handler, notFound, forbidden, badRequest } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { isGroupMember } from "@/lib/balances";
import { safeAttachmentFilename, attachmentBytesMatchMime } from "@/lib/attachments";
import { insertExpenseAttachment } from "@/lib/attachment-writes";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 4 * 1024 * 1024; // keep well under serverless body limits
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

export const POST = handler(async (req: NextRequest, { params }: Ctx) => {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const rows = await sql`SELECT group_id FROM expenses WHERE id = ${id}`;
  if (rows.length === 0) notFound("Expense not found");
  if (!(await isGroupMember(Number(rows[0].group_id), user.id))) forbidden();

  // Reject an oversized body via Content-Length BEFORE buffering it into memory
  // with formData() (defense against a memory-spike DoS). The per-file size is
  // still re-checked below; the 1 MB slack covers multipart framing overhead.
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BYTES + 1024 * 1024) {
    badRequest("File too large (max 4 MB)");
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) badRequest("No file uploaded");
  if (!ALLOWED.includes(file.type)) badRequest("Only images and PDFs are allowed");
  if (file.size > MAX_BYTES) badRequest("File too large (max 4 MB)");

  const buf = Buffer.from(await file.arrayBuffer());
  if (!attachmentBytesMatchMime(buf, file.type)) badRequest("File content does not match its type");
  const filename = safeAttachmentFilename(file.name);
  const insertedId = await insertExpenseAttachment({
    expenseId: id,
    userId: user.id,
    filename,
    mime: file.type,
    data: buf,
  });
  if (insertedId === null) forbidden();
  return NextResponse.json({ id: insertedId });
});
