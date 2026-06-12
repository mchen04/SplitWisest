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
