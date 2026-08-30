import { describe, expect, it } from "vitest";
import { localDateStr } from "../client";

describe("localDateStr", () => {
  it("keeps the local date near midnight", () => {
    const lateEvening = new Date(2026, 7, 30, 23, 30);

    expect(localDateStr(lateEvening)).toBe("2026-08-30");
  });
});
