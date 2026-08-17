import { describe, expect, it } from "vitest";
import { startsMessageBurst } from "../chat";

describe("startsMessageBurst", () => {
  it("starts with the first message", () => {
    expect(startsMessageBurst("2026-08-17T20:00:00Z")).toBe(true);
  });

  it("groups messages sent within one hour", () => {
    expect(startsMessageBurst("2026-08-17T20:45:00Z", "2026-08-17T20:00:00Z")).toBe(false);
  });

  it("starts a burst after one hour", () => {
    expect(startsMessageBurst("2026-08-17T21:00:00Z", "2026-08-17T20:00:00Z")).toBe(true);
  });

  it("starts a burst on a new local date", () => {
    const beforeMidnight = new Date(2026, 7, 17, 23, 50).toISOString();
    const afterMidnight = new Date(2026, 7, 18, 0, 10).toISOString();
    expect(startsMessageBurst(afterMidnight, beforeMidnight)).toBe(true);
  });
});
