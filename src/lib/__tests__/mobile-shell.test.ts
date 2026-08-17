import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile app shell", () => {
  it("keeps navigation above the iPhone safe area", () => {
    const css = source("src/app/globals.css");
    expect(source("src/app/layout.tsx")).toContain('viewportFit: "cover"');
    expect(css).toMatch(/:root\s*\{[^}]*--safe-area-bottom: env\(safe-area-inset-bottom, 0px\)/);
    expect(css).toMatch(/\.mobile-nav\s*\{[^}]*padding-bottom: calc\(var\(--safe-area-bottom\) \+ var\(--mobile-nav-lift\)\)/);
    expect(source("src/components/shell.tsx")).toContain("mobile-nav");
  });

  it("keeps chat controls inside the visible viewport", () => {
    expect(source("src/components/shell.tsx")).toContain('pathname === "/chat"');
    expect(source("src/components/shell.tsx")).toContain("mobile-chat-main");
    expect(source("src/app/chat/page.tsx")).toContain("flex min-h-0 flex-1 flex-col overflow-hidden");
  });

  it("hides mobile navigation while the message field has focus", () => {
    const css = source("src/app/globals.css");
    expect(source("src/components/chat.tsx")).toContain('className="chat-composer-input"');
    expect(css).toMatch(/body:has\(\.chat-composer-input:focus\) \.mobile-nav\s*\{[^}]*display: none !important/);
  });
});
