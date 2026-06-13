const FALLBACK_FILENAME = "receipt";

export function safeAttachmentFilename(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  const filename = raw
    .replace(/[/\\]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/"/g, "")
    .trim();
  return filename || FALLBACK_FILENAME;
}

export function attachmentContentDisposition(filename: unknown): string {
  const safe = safeAttachmentFilename(filename);
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

// Verify the upload's leading "magic" bytes actually match its declared MIME, so
// a script payload labeled image/png can't be stored and later served inline.
export function attachmentBytesMatchMime(buf: Buffer, mime: string): boolean {
  const startsWith = (...bytes: number[]) => bytes.every((b, i) => buf[i] === b);
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString("latin1");
  switch (mime) {
    case "image/jpeg":
      return startsWith(0xff, 0xd8, 0xff);
    case "image/png":
      return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/gif":
      return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "application/pdf":
      // The %PDF- header may legally follow a small amount of leading bytes.
      return ascii(0, 1024).includes("%PDF-");
    default:
      return false;
  }
}
