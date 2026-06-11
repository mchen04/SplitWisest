import { describe, it, expect } from "vitest";
import {
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
  computeItemizedShares,
  simplifyDebts,
  parseAmountToCents,
} from "../money";

const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("splitEqual", () => {
  it("splits evenly", () => {
    const m = splitEqual(900, [1, 2, 3]);
    expect([...m.values()]).toEqual([300, 300, 300]);
  });
  it("distributes remainder cents to earliest participants", () => {
    const m = splitEqual(1000, [1, 2, 3]);
    expect(m.get(1)).toBe(334);
    expect(m.get(2)).toBe(333);
    expect(m.get(3)).toBe(333);
    expect(sum(m)).toBe(1000);
  });
  it("handles single participant", () => {
    expect(splitEqual(555, [7]).get(7)).toBe(555);
  });
  it("rejects empty participants", () => {
    expect(() => splitEqual(100, [])).toThrow();
  });
});

describe("splitExact", () => {
  it("accepts exact totals", () => {
    const m = splitExact(1000, [
      { userId: 1, value: 700 },
      { userId: 2, value: 300 },
    ]);
    expect(m.get(1)).toBe(700);
    expect(sum(m)).toBe(1000);
  });
  it("rejects mismatched totals", () => {
    expect(() =>
      splitExact(1000, [
        { userId: 1, value: 700 },
        { userId: 2, value: 200 },
      ])
    ).toThrow(/add up/);
  });
  it("rejects negative shares", () => {
    expect(() => splitExact(100, [{ userId: 1, value: -50 }, { userId: 2, value: 150 }])).toThrow();
  });
});

describe("splitPercentage", () => {
  it("splits by percent and sums exactly", () => {
    const m = splitPercentage(1001, [
      { userId: 1, value: 50 },
      { userId: 2, value: 25 },
      { userId: 3, value: 25 },
    ]);
    expect(sum(m)).toBe(1001);
    expect(m.get(1)).toBeGreaterThanOrEqual(500);
  });
  it("handles thirds without losing cents", () => {
    const m = splitPercentage(100, [
      { userId: 1, value: 33.33 },
      { userId: 2, value: 33.33 },
      { userId: 3, value: 33.34 },
    ]);
    expect(sum(m)).toBe(100);
  });
  it("rejects percentages not totaling 100", () => {
    expect(() => splitPercentage(100, [{ userId: 1, value: 60 }, { userId: 2, value: 30 }])).toThrow();
  });
});

describe("splitShares", () => {
  it("splits proportionally to shares", () => {
    const m = splitShares(900, [
      { userId: 1, value: 2 },
      { userId: 2, value: 1 },
    ]);
    expect(m.get(1)).toBe(600);
    expect(m.get(2)).toBe(300);
  });
  it("sums exactly with awkward ratios", () => {
    const m = splitShares(1000, [
      { userId: 1, value: 1 },
      { userId: 2, value: 1 },
      { userId: 3, value: 1 },
    ]);
    expect(sum(m)).toBe(1000);
  });
  it("rejects zero total shares", () => {
    expect(() => splitShares(100, [{ userId: 1, value: 0 }])).toThrow();
  });
});

describe("computeItemizedShares", () => {
  it("sums item splits per user", () => {
    const m = computeItemizedShares(1500, [
      { amountCents: 1000, participantIds: [1, 2] },
      { amountCents: 500, participantIds: [2] },
    ]);
    expect(m.get(1)).toBe(500);
    expect(m.get(2)).toBe(1000);
    expect(sum(m)).toBe(1500);
  });
  it("rejects items not matching total", () => {
    expect(() => computeItemizedShares(1000, [{ amountCents: 900, participantIds: [1] }])).toThrow();
  });
  it("handles odd-cent items without losing money", () => {
    const m = computeItemizedShares(101, [{ amountCents: 101, participantIds: [1, 2] }]);
    expect(sum(m)).toBe(101);
  });
});

describe("simplifyDebts", () => {
  it("nets a simple triangle into minimal transfers", () => {
    // A is owed 100, B owes 50, C owes 50
    const t = simplifyDebts(new Map([[1, 100], [2, -50], [3, -50]]));
    expect(t).toHaveLength(2);
    expect(t.every((x) => x.to === 1)).toBe(true);
    expect(t.reduce((s, x) => s + x.amountCents, 0)).toBe(100);
  });
  it("returns empty for settled balances", () => {
    expect(simplifyDebts(new Map([[1, 0], [2, 0]]))).toEqual([]);
  });
  it("conserves money", () => {
    const net = new Map([[1, 730], [2, -200], [3, -310], [4, -220]]);
    const t = simplifyDebts(net);
    expect(t.reduce((s, x) => s + x.amountCents, 0)).toBe(730);
    expect(t.length).toBeLessThanOrEqual(3);
  });
});

describe("parseAmountToCents", () => {
  it("parses dollars", () => {
    expect(parseAmountToCents("12.34")).toBe(1234);
    expect(parseAmountToCents("$1,000.50")).toBe(100050);
  });
  it("rejects garbage and non-positive", () => {
    expect(() => parseAmountToCents("abc")).toThrow();
    expect(() => parseAmountToCents("0")).toThrow();
  });
});
