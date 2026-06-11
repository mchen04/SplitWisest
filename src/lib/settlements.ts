import { z } from "zod";
import { sql } from "./db";
import { fmtMoney } from "./money";
import { CURRENCIES } from "./fx";

// Validation fields shared by group and direct (friend) settlement bodies.
export const settlementFields = {
  amountCents: z.number().int().positive("Amount must be positive").max(100_000_000_000),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  note: z.string().max(500).default(""),
};

// The activity summary line shared by both settlement routes.
export async function settlementSummary(
  payerId: number,
  recipientId: number,
  amountCents: number,
  currency: string
): Promise<string> {
  const names = await sql`SELECT id, display_name FROM users WHERE id IN (${payerId}, ${recipientId})`;
  const nameOf = (id: number) => names.find((n) => Number(n.id) === id)?.display_name ?? "Someone";
  return `${nameOf(payerId)} paid ${nameOf(recipientId)} ${fmtMoney(amountCents, currency)} (recorded offline)`;
}
