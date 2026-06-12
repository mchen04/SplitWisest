import { describe, expect, it } from "vitest";
import { attachmentContentDisposition, safeAttachmentFilename } from "../attachments";

describe("attachment filenames", () => {
  it("removes header-unsafe characters from stored filenames", () => {
    expect(safeAttachmentFilename("..\r\nbad/path\".png")).toBe("..bad_path.png");
  });

  it("falls back when sanitization leaves no filename", () => {
    expect(safeAttachmentFilename("\r\n\t")).toBe("receipt");
  });

  it("emits a standards-safe content disposition value", () => {
    const header = attachmentContentDisposition("résumé receipt.png");
    expect(header).toBe("inline; filename=\"résumé receipt.png\"; filename*=UTF-8''r%C3%A9sum%C3%A9%20receipt.png");
    expect(() => new Response("ok", { headers: { "Content-Disposition": header } })).not.toThrow();
  });
});
