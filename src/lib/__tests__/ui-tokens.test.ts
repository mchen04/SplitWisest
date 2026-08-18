import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findUiTokenViolations, scanUiTokens } from "../../../scripts/check-ui-tokens";

describe("UI token enforcement", () => {
  it("rejects one-off sizes and colors", () => {
    const source = '<div className="text-[13px] rounded-[10px] w-[37px] text-[#123456]" />';
    expect(findUiTokenViolations(source, "example.tsx").map((item) => item.rule)).toEqual([
      "arbitrary pixel class",
      "arbitrary pixel class",
      "arbitrary pixel class",
      "arbitrary text size",
      "arbitrary radius",
      "hard-coded component color",
    ]);
  });

  it("allows named tokens and structural values", () => {
    const source = '<div className="text-sm rounded-lg w-[78%] text-[var(--group-ink)]" />';
    expect(findUiTokenViolations(source, "example.tsx")).toEqual([]);
  });

  it("keeps the application source on the token system", () => {
    expect(scanUiTokens()).toEqual([]);
  });

  it("holds the ramp to one role per size", () => {
    // 12 / 14 / 16 / 20 / 24 / 32 / 40. 18 is unset because against 20 it is a
    // 1.11 step — close enough to read as an accident rather than a level.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--text-lg: initial;");
    expect(css).toContain("--text-lg--line-height: initial;");
    expect(findUiTokenViolations('<h2 className="text-lg" />', "example.tsx").map((item) => item.rule))
      .toEqual(["off-ramp text size (text-lg)"]);
  });
});
