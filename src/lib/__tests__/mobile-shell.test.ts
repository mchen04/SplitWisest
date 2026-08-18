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

  it("pins navigation to the frame rather than to the viewport", () => {
    // The bar used to be `position: fixed; bottom: 0` over a scrolling document.
    // iOS resolves that bottom edge differently depending on whether the document
    // scrolls at all, so it landed in one place on Home (which overflows) and
    // another on Groups, Balances, and Chat (which fit in one screen). As the
    // frame's last flex row it has no viewport to drift against.
    const css = source("src/app/globals.css");
    const shell = source("src/components/shell.tsx");
    expect(css).toMatch(/\.app-frame\s*\{[^}]*position: fixed;[^}]*height: 100dvh;/);
    expect(css).toMatch(/\.mobile-nav\s*\{[^}]*flex: 0 0 auto;/);
    expect(shell).toContain('<div className="app-frame">');
    expect(shell).not.toMatch(/mobile-nav[^"]*\bfixed\b/);
    // Nothing scrolls behind the bar any more, so it must not clear a fixed one.
    expect(shell).not.toContain("pb-24");
  });

  it("gives the frame exactly one scrolling region", () => {
    const css = source("src/app/globals.css");
    // `min-height: 0` is what lets the region shrink below its content instead
    // of pushing navigation off the bottom of the frame.
    expect(css).toMatch(/\.app-scroll\s*\{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(css).toMatch(
      /@media \(max-width: 47\.999rem\)[\s\S]*?html:has\(\.app-frame\)[\s\S]*?overflow: hidden;/,
    );
    expect(source("src/components/shell.tsx")).toContain("app-scroll");
  });

  it("keeps chat controls inside the visible viewport", () => {
    const shell = source("src/components/shell.tsx");
    expect(shell).toContain('pathname === "/chat"');
    // Chat scrolls its own message list, so its region of the frame does not.
    expect(shell).toContain("app-fixed");
    expect(source("src/app/globals.css")).toMatch(/\.app-fixed\s*\{[^}]*overflow: hidden;/);
    expect(source("src/app/chat/page.tsx")).toContain("flex min-h-0 flex-1 flex-col overflow-hidden");
  });

  it("reserves the scrollbar gutter so the desktop layout keeps one width", () => {
    // Without a stable gutter the layout measured differently on scrolling routes
    // than on short ones, so every item shifted on navigation.
    expect(source("src/app/globals.css")).toMatch(
      /html \{[^}]*overflow-y: auto;[^}]*scrollbar-gutter: stable;/,
    );
  });

  it("carries no page title row on any route", () => {
    // A title row that differed per route was the thing that made the header
    // appear to change size on every tab. There is now no title row at all, and
    // each page's actions live in its content.
    const shell = source("src/components/shell.tsx");
    expect(shell).not.toMatch(/<header[^>]*md:hidden/);
    expect(shell).not.toContain("PageTitle");
    for (const page of [
      "src/app/page.tsx",
      "src/app/groups/page.tsx",
      "src/app/balances/page.tsx",
      "src/app/chat/page.tsx",
      "src/app/expenses/page.tsx",
      "src/app/activity/page.tsx",
      "src/app/settings/page.tsx",
    ]) {
      expect(source(page), page).not.toContain("PageTitle");
    }
    // The dashboard avatar is the only mobile route to settings, and it has to
    // stay a thumb-sized target.
    expect(source("src/app/page.tsx")).toMatch(
      /href="\/settings"[^>]*aria-label="Account settings"[^>]*h-11 w-11/,
    );
  });

  it("locks the document only where a frame exists", () => {
    // The lock belongs to routes that own a scrolling region. Applied to every
    // mobile route it also caught login, signup, and recovery, which render
    // outside the shell — their submit button fell below a fold that could not
    // be scrolled to, so landscape phones could not log in at all.
    const css = source("src/app/globals.css");
    expect(css).toMatch(/html:has\(\.app-frame\),\s*html:has\(\.app-frame\) body \{[^}]*overflow: hidden;/);
    expect(css).not.toMatch(/@media \(max-width: 47\.999rem\)[\s\S]*?\n  html,\n  body \{/);
    expect(source("src/components/auth-frame.tsx")).toContain("min-h-dvh");
  });

  it("gives every shell route a heading even though none shows one", () => {
    // No page renders a title, but a page with no heading announces nothing.
    expect(source("src/components/shell.tsx")).toContain('<h1 className="sr-only">{title}</h1>');
    for (const page of [
      "src/app/page.tsx",
      "src/app/groups/page.tsx",
      "src/app/balances/page.tsx",
      "src/app/chat/page.tsx",
      "src/app/expenses/page.tsx",
      "src/app/activity/page.tsx",
      "src/app/settings/page.tsx",
      "src/app/groups/[id]/page.tsx",
    ]) {
      expect(source(page), page).toMatch(/<AppShell title=/);
    }
  });

  it("hides mobile navigation while the message field has focus", () => {
    const css = source("src/app/globals.css");
    expect(source("src/components/chat.tsx")).toContain('className="chat-composer-input"');
    expect(css).toMatch(/body:has\(\.chat-composer-input:focus\) \.mobile-nav\s*\{[^}]*display: none !important/);
  });
});
