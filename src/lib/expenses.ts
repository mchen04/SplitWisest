import { z } from "zod";
import { sql } from "./db";
import { computeShares, computeItemizedShares, SplitMethod } from "./money";
import { convert, CURRENCIES } from "./fx";
import { badRequest } from "./api";

export const ExpenseBody = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  amountCents: z.number().int().positive("Amount must be positive").max(100_000_000_000),
  currency: z.string().refine((c) => CURRENCIES.includes(c), "Unsupported currency"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  payerId: z.number().int().positive(),
  categoryId: z.number().int().positive().nullable().optional(),
  notes: z.string().max(2000).default(""),
  splitMethod: z.enum(["equal", "exact", "percentage", "shares", "itemized"]),
  participants: z
    .array(z.object({ userId: z.number().int().positive(), value: z.number().optional() }))
    .min(1, "At least one participant is required"),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        amountCents: z.number().int().min(0),
        participantIds: z.array(z.number().int().positive()).min(1),
      })
    )
    .optional(),
});

export type ExpenseInput = z.infer<typeof ExpenseBody>;

export async function validateExpense(groupId: number, input: ExpenseInput) {
  const memberRows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  const memberIds = new Set(memberRows.map((r) => Number(r.user_id)));
  if (!memberIds.has(input.payerId)) badRequest("Payer must be a group member");
  for (const p of input.participants) {
    if (!memberIds.has(p.userId)) badRequest("All participants must be group members");
  }
  const uniq = new Set(input.participants.map((p) => p.userId));
  if (uniq.size !== input.participants.length) badRequest("Duplicate participants");

  let shares: Map<number, number>;
  if (input.splitMethod === "itemized") {
    if (!input.items || input.items.length === 0) badRequest("Itemized expenses need at least one item");
    for (const item of input.items!) {
      for (const pid of item.participantIds) {
        if (!memberIds.has(pid)) badRequest("All item participants must be group members");
      }
    }
    shares = computeItemizedShares(input.amountCents, input.items!);
  } else {
    shares = computeShares(input.splitMethod as SplitMethod, input.amountCents, input.participants);
  }
  return shares;
}

export async function insertExpense(
  groupId: number,
  groupCurrency: string,
  createdBy: number,
  input: ExpenseInput,
  recurringId: number | null = null
): Promise<number> {
  const shares = await validateExpense(groupId, input);
  const { cents: convertedCents, rate } = await convert(input.amountCents, input.currency, groupCurrency);
  const rows = await sql`
    INSERT INTO expenses (group_id, title, amount_cents, currency, converted_cents, fx_rate,
      expense_date, payer_id, category_id, notes, split_method, recurring_id, created_by)
    VALUES (${groupId}, ${input.title}, ${input.amountCents}, ${input.currency}, ${convertedCents},
      ${rate}, ${input.date}, ${input.payerId}, ${input.categoryId ?? null}, ${input.notes},
      ${input.splitMethod}, ${recurringId}, ${createdBy})
    RETURNING id`;
  const expenseId = Number(rows[0].id);
  await writeShares(expenseId, shares, input);
  return expenseId;
}

export async function updateExpense(expenseId: number, groupId: number, groupCurrency: string, input: ExpenseInput) {
  const shares = await validateExpense(groupId, input);
  const { cents: convertedCents, rate } = await convert(input.amountCents, input.currency, groupCurrency);
  await sql`
    UPDATE expenses SET title = ${input.title}, amount_cents = ${input.amountCents},
      currency = ${input.currency}, converted_cents = ${convertedCents}, fx_rate = ${rate},
      expense_date = ${input.date}, payer_id = ${input.payerId},
      category_id = ${input.categoryId ?? null}, notes = ${input.notes},
      split_method = ${input.splitMethod}, updated_at = now()
    WHERE id = ${expenseId}`;
  await sql`DELETE FROM expense_shares WHERE expense_id = ${expenseId}`;
  await sql`DELETE FROM expense_items WHERE expense_id = ${expenseId}`;
  await writeShares(expenseId, shares, input);
}

async function writeShares(expenseId: number, shares: Map<number, number>, input: ExpenseInput) {
  const rawByUser = new Map(input.participants.map((p) => [p.userId, p.value ?? null]));
  for (const [userId, cents] of shares) {
    await sql`INSERT INTO expense_shares (expense_id, user_id, share_cents, raw_input)
              VALUES (${expenseId}, ${userId}, ${cents}, ${rawByUser.get(userId) ?? null})`;
  }
  if (input.splitMethod === "itemized" && input.items) {
    for (const item of input.items) {
      await sql`INSERT INTO expense_items (expense_id, name, amount_cents, participant_ids)
                VALUES (${expenseId}, ${item.name}, ${item.amountCents}, ${item.participantIds})`;
    }
  }
}

// Materialize any due recurring expenses for a group. Called lazily when the
// group is viewed, so no cron infrastructure is needed.
export async function materializeRecurring(groupId: number) {
  const due = await sql`
    SELECT * FROM recurring_expenses
    WHERE group_id = ${groupId} AND active AND next_date <= CURRENT_DATE`;
  for (const r of due) {
    const group = await sql`SELECT currency FROM groups WHERE id = ${groupId}`;
    let nextDate = r.next_date as string;
    // create one expense per missed period, capped to avoid runaway loops
    for (let i = 0; i < 24; i++) {
      const nd = new Date(nextDate + "T00:00:00Z");
      if (nd.getTime() > Date.now()) break;
      const participants = (r.participant_ids as number[]).map((id) => ({ userId: Number(id) }));
      try {
        await insertExpense(
          groupId,
          group[0].currency,
          Number(r.created_by),
          {
            title: r.title,
            amountCents: Number(r.amount_cents),
            currency: r.currency,
            date: nextDate,
            payerId: Number(r.payer_id),
            categoryId: r.category_id ? Number(r.category_id) : null,
            notes: r.notes,
            splitMethod: "equal",
            participants,
          },
          Number(r.id)
        );
      } catch {
        break; // e.g. a participant left the group; stop materializing
      }
      if (r.cadence === "weekly") nd.setUTCDate(nd.getUTCDate() + 7);
      else nd.setUTCMonth(nd.getUTCMonth() + 1);
      nextDate = nd.toISOString().slice(0, 10);
    }
    await sql`UPDATE recurring_expenses SET next_date = ${nextDate} WHERE id = ${r.id}`;
  }
}
