// All money is handled as integer cents. Splits must sum exactly to the total;
// remainders from integer division are distributed one cent at a time to the
// earliest participants so nothing is ever lost or invented.

export type SplitMethod = "equal" | "exact" | "percentage" | "shares" | "itemized";

export interface SplitInput {
  userId: number;
  // meaning depends on method: exact = cents, percentage = percent (0-100), shares = share count
  value?: number;
}

export function splitEqual(totalCents: number, userIds: number[]): Map<number, number> {
  if (userIds.length === 0) throw new Error("No participants");
  const base = Math.floor(totalCents / userIds.length);
  let remainder = totalCents - base * userIds.length;
  const out = new Map<number, number>();
  for (const id of userIds) {
    out.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

export function splitExact(totalCents: number, inputs: SplitInput[]): Map<number, number> {
  if (inputs.length === 0) throw new Error("No participants");
  const out = new Map<number, number>();
  let sum = 0;
  for (const { userId, value } of inputs) {
    const cents = Math.round(value ?? 0);
    if (cents < 0) throw new Error("Negative share");
    out.set(userId, cents);
    sum += cents;
  }
  if (sum !== totalCents) {
    throw new Error(`Exact amounts must add up to the total (got ${sum}, expected ${totalCents})`);
  }
  return out;
}

export function splitPercentage(totalCents: number, inputs: SplitInput[]): Map<number, number> {
  if (inputs.length === 0) throw new Error("No participants");
  if (inputs.some((i) => (i.value ?? 0) < 0)) throw new Error("Percentages must be positive");
  const totalPct = inputs.reduce((s, i) => s + (i.value ?? 0), 0);
  if (Math.abs(totalPct - 100) > 0.001) {
    throw new Error(`Percentages must add up to 100 (got ${totalPct})`);
  }
  return distributeProportional(
    totalCents,
    inputs.map((i) => ({ userId: i.userId, weight: i.value ?? 0 }))
  );
}

export function splitShares(totalCents: number, inputs: SplitInput[]): Map<number, number> {
  if (inputs.length === 0) throw new Error("No participants");
  if (inputs.some((i) => (i.value ?? 0) < 0)) throw new Error("Shares must be positive");
  const totalShares = inputs.reduce((s, i) => s + (i.value ?? 0), 0);
  if (totalShares <= 0) throw new Error("Total shares must be positive");
  return distributeProportional(
    totalCents,
    inputs.map((i) => ({ userId: i.userId, weight: i.value ?? 0 }))
  );
}

// Largest-remainder method: floor each proportional share, then hand out the
// leftover cents to the largest fractional remainders.
function distributeProportional(
  totalCents: number,
  weights: { userId: number; weight: number }[]
): Map<number, number> {
  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) throw new Error("Total weight must be positive");
  const rows = weights.map(({ userId, weight }) => {
    const raw = (totalCents * weight) / totalWeight;
    const floor = Math.floor(raw);
    return { userId, floor, frac: raw - floor };
  });
  let leftover = totalCents - rows.reduce((s, r) => s + r.floor, 0);
  const byFrac = [...rows].sort((a, b) => b.frac - a.frac);
  const bonus = new Map<number, number>();
  for (const r of byFrac) {
    bonus.set(r.userId, leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover--;
  }
  const out = new Map<number, number>();
  for (const r of rows) out.set(r.userId, r.floor + (bonus.get(r.userId) ?? 0));
  return out;
}

export function computeShares(
  method: SplitMethod,
  totalCents: number,
  inputs: SplitInput[]
): Map<number, number> {
  switch (method) {
    case "equal":
      return splitEqual(totalCents, inputs.map((i) => i.userId));
    case "exact":
      return splitExact(totalCents, inputs);
    case "percentage":
      return splitPercentage(totalCents, inputs);
    case "shares":
      return splitShares(totalCents, inputs);
    case "itemized":
      // itemized expenses compute shares from items; handled by caller
      throw new Error("Itemized shares are computed from items");
  }
}

// Items: each item's cost is split equally among its participants; a user's
// total share is the sum across items. Item amounts must sum to the total.
export function computeItemizedShares(
  totalCents: number,
  items: { amountCents: number; participantIds: number[] }[],
  adjustments: { taxCents?: number; tipCents?: number } = {}
): Map<number, number> {
  const itemSum = items.reduce((s, i) => s + i.amountCents, 0);
  const adjustmentTotal = Math.round(adjustments.taxCents ?? 0) + Math.round(adjustments.tipCents ?? 0);
  if (itemSum + adjustmentTotal !== totalCents) {
    throw new Error(`Item amounts plus tax and tip must add up to the total (got ${itemSum + adjustmentTotal}, expected ${totalCents})`);
  }
  const out = new Map<number, number>();
  for (const item of items) {
    if (item.participantIds.length === 0) throw new Error("Each item needs at least one participant");
    const split = splitEqual(item.amountCents, item.participantIds);
    for (const [uid, cents] of split) out.set(uid, (out.get(uid) ?? 0) + cents);
  }
  if (adjustmentTotal > 0) {
    if (itemSum <= 0) throw new Error("Item subtotal must be positive when tax or tip is added");
    const adjustmentShares = distributeProportional(
      adjustmentTotal,
      [...out.entries()].map(([userId, weight]) => ({ userId, weight }))
    );
    for (const [uid, cents] of adjustmentShares) out.set(uid, (out.get(uid) ?? 0) + cents);
  }
  return out;
}

// Greedy debt simplification: match the largest debtor with the largest
// creditor repeatedly. Produces at most n-1 transfers.
export interface Transfer {
  from: number;
  to: number;
  amountCents: number;
}

export function simplifyDebts(netBalances: Map<number, number>): Transfer[] {
  const creditors: { id: number; amt: number }[] = [];
  const debtors: { id: number; amt: number }[] = [];
  for (const [id, net] of netBalances) {
    if (net > 0) creditors.push({ id, amt: net });
    else if (net < 0) debtors.push({ id, amt: -net });
  }
  creditors.sort((a, b) => b.amt - a.amt || a.id - b.id);
  debtors.sort((a, b) => b.amt - a.amt || a.id - b.id);
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].amt, debtors[di].amt);
    if (pay > 0) transfers.push({ from: debtors[di].id, to: creditors[ci].id, amountCents: pay });
    creditors[ci].amt -= pay;
    debtors[di].amt -= pay;
    if (creditors[ci].amt === 0) ci++;
    if (debtors[di].amt === 0) di++;
  }
  return transfers;
}

export function fmtMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function parseAmountToCents(input: string): number {
  // Treat a comma followed by 1-2 trailing digits as a decimal separator
  // ("12,34" → 12.34); otherwise commas are thousands separators.
  const normalized = /,\d{1,2}$/.test(input.trim()) && !input.includes(".")
    ? input.replace(/,(\d{1,2})$/, ".$1")
    : input;
  const cleaned = normalized.replace(/[^0-9.]/g, "");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) throw new Error("Invalid amount");
  const cents = Math.round(parseFloat(cleaned) * 100);
  if (!Number.isFinite(cents) || cents <= 0) throw new Error("Amount must be positive");
  if (cents > 100_000_000_000) throw new Error("Amount too large");
  return cents;
}
