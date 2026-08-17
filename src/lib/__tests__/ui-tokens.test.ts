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
});
