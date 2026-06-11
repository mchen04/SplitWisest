import { z } from "zod";
import { sql } from "./db";
import { computeShares, computeItemizedShares, SplitMethod } from "./money";
import { convert, CURRENCIES } from "./fx";
import { ApiError, badRequest } from "./api";

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
    .array(z.object({ userId: z.number().int().positive(), value: z.number().min(0, "Values must be positive").optional() }))
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

export async function validateExpense(groupId: number, userId: number, input: ExpenseInput) {
  const memberRows = await sql`SELECT user_id FROM group_members WHERE group_id = ${groupId}`;
  const memberIds = new Set(memberRows.map((r) => Number(r.user_id)));
  if (!memberIds.has(input.payerId)) badRequest("Payer must be a group member");
  for (const p of input.participants) {
    if (!memberIds.has(p.userId)) badRequest("All participants must be group members");
  }
  const uniq = new Set(input.participants.map((p) => p.userId));
  if (uniq.size !== input.participants.length) badRequest("Duplicate participants");

  if (input.categoryId) {
    const cat = await sql`
      SELECT 1 FROM categories WHERE id = ${input.categoryId} AND (owner_id IS NULL OR owner_id = ${userId})`;
    if (cat.length === 0) badRequest("Unknown category");
  }

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

function sharesJson(shares: Map<number, number>, input: ExpenseInput): string {
  const rawByUser = new Map(input.participants.map((p) => [p.userId, p.value ?? null]));
  return JSON.stringify(
    [...shares.entries()].map(([userId, cents]) => ({
      user_id: userId,
      share_cents: cents,
      raw_input: rawByUser.get(userId) ?? null,
    }))
  );
}

function itemsJson(input: ExpenseInput): string {
  if (input.splitMethod !== "itemized" || !input.items) return "[]";
  return JSON.stringify(
    input.items.map((i) => ({
      name: i.name.trim() || "Item",
      amount_cents: i.amountCents,
      participant_ids: i.participantIds,
    }))
  );
}

// Insert the expense, its shares, and its items in ONE SQL statement so the
// write is atomic — the Neon HTTP driver has no multi-statement transactions,
// and a partial write (expense without shares) would corrupt balances.
export async function insertExpense(
  groupId: number,
  groupCurrency: string,
  createdBy: number,
  input: ExpenseInput,
  recurringId: number | null = null
): Promise<number> {
  const shares = await validateExpense(groupId, createdBy, input);
  const { cents: convertedCents, rate } = await convert(input.amountCents, input.currency, groupCurrency);
  const rows = await sql`
    WITH e AS (
      INSERT INTO expenses (group_id, title, amount_cents, currency, converted_cents, fx_rate,
        expense_date, payer_id, category_id, notes, split_method, recurring_id, created_by)
      VALUES (${groupId}, ${input.title}, ${input.amountCents}, ${input.currency}, ${convertedCents},
        ${rate}, ${input.date}, ${input.payerId}, ${input.categoryId ?? null}, ${input.notes},
        ${input.splitMethod}, ${recurringId}, ${createdBy})
      RETURNING id
    ),
    s AS (
      INSERT INTO expense_shares (expense_id, user_id, share_cents, raw_input)
      SELECT e.id, x.user_id, x.share_cents, x.raw_input
      FROM e, jsonb_to_recordset(${sharesJson(shares, input)}::jsonb)
        AS x(user_id bigint, share_cents bigint, raw_input numeric)
      RETURNING 1
    ),
    it AS (
      INSERT INTO expense_items (expense_id, name, amount_cents, participant_ids)
      SELECT e.id, x.name, x.amount_cents,
        ARRAY(SELECT jsonb_array_elements_text(x.participant_ids)::bigint)
      FROM e, jsonb_to_recordset(${itemsJson(input)}::jsonb)
        AS x(name text, amount_cents bigint, participant_ids jsonb)
      RETURNING 1
    )
    SELECT e.id FROM e`;
  return Number(rows[0].id);
}

// Atomic update: one statement rewrites the expense row, its shares, and items.
// FX is preserved from the existing row when the monetary fields are unchanged,
// so editing a title never silently re-converts at today's rate.
export async function updateExpense(
  expenseId: number,
  groupId: number,
  groupCurrency: string,
  userId: number,
  input: ExpenseInput,
  prev: { amountCents: number; currency: string; convertedCents: number; fxRate: number }
) {
  const shares = await validateExpense(groupId, userId, input);
  let convertedCents = prev.convertedCents;
  let rate = prev.fxRate;
  if (input.amountCents !== prev.amountCents || input.currency !== prev.currency) {
    const c = await convert(input.amountCents, input.currency, groupCurrency);
    convertedCents = c.cents;
    rate = c.rate;
  }
  await sql`
    WITH upd AS (
      UPDATE expenses SET title = ${input.title}, amount_cents = ${input.amountCents},
        currency = ${input.currency}, converted_cents = ${convertedCents}, fx_rate = ${rate},
        expense_date = ${input.date}, payer_id = ${input.payerId},
        category_id = ${input.categoryId ?? null}, notes = ${input.notes},
        split_method = ${input.splitMethod}, updated_at = now()
      WHERE id = ${expenseId}
      RETURNING id
    ),
    del_s AS (DELETE FROM expense_shares WHERE expense_id = ${expenseId} RETURNING 1),
    del_i AS (DELETE FROM expense_items WHERE expense_id = ${expenseId} RETURNING 1),
    ins_s AS (
      INSERT INTO expense_shares (expense_id, user_id, share_cents, raw_input)
      SELECT ${expenseId}, x.user_id, x.share_cents, x.raw_input
      FROM jsonb_to_recordset(${sharesJson(shares, input)}::jsonb)
        AS x(user_id bigint, share_cents bigint, raw_input numeric)
      -- referencing del_s forces it to run first; sibling CTEs are otherwise
      -- unordered and the insert would collide with the old PK rows
      WHERE (SELECT count(*) FROM del_s) >= 0
      RETURNING 1
    ),
    ins_i AS (
      INSERT INTO expense_items (expense_id, name, amount_cents, participant_ids)
      SELECT ${expenseId}, x.name, x.amount_cents,
        ARRAY(SELECT jsonb_array_elements_text(x.participant_ids)::bigint)
      FROM jsonb_to_recordset(${itemsJson(input)}::jsonb)
        AS x(name text, amount_cents bigint, participant_ids jsonb)
      WHERE (SELECT count(*) FROM del_i) >= 0
      RETURNING 1
    )
    SELECT 1`;
}

function nextOccurrence(current: string, cadence: string, anchorDay: number): string {
  const d = new Date(current + "T00:00:00Z");
  if (cadence === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    // Monthly: advance the month and clamp to the anchor day so "rent on the
    // 31st" never drifts (Jan 31 → Feb 28 → Mar 31).
    const month = d.getUTCMonth() + 1;
    const target = new Date(Date.UTC(d.getUTCFullYear(), month, 1));
    const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(anchorDay, daysInMonth));
    return target.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

// Materialize due recurring expenses for a group, lazily on group view.
// Each period is claimed with a compare-and-set on next_date before inserting,
// so concurrent viewers can't double-create and a crash never replays periods.
export async function materializeRecurring(groupId: number) {
  const due = await sql`
    SELECT r.*, g.currency AS group_currency FROM recurring_expenses r
    JOIN groups g ON g.id = r.group_id
    WHERE r.group_id = ${groupId} AND r.active AND r.next_date <= CURRENT_DATE`;
  for (const r of due) {
    const anchorDay = Number(r.anchor_day ?? new Date(String(r.next_date).slice(0, 10) + "T00:00:00Z").getUTCDate());
    let current = String(r.next_date).slice(0, 10);
    for (let i = 0; i < 24; i++) {
      if (new Date(current + "T00:00:00Z").getTime() > Date.now()) break;
      const next = nextOccurrence(current, r.cadence, anchorDay);
      // Claim this period: only one request wins the compare-and-set.
      const claimed = await sql`
        UPDATE recurring_expenses SET next_date = ${next}
        WHERE id = ${r.id} AND next_date = ${current} AND active
        RETURNING id`;
      if (claimed.length === 0) break; // another request is materializing
      const participants = (r.participant_ids as number[]).map((id) => ({ userId: Number(id) }));
      try {
        await insertExpense(
          groupId,
          r.group_currency,
          Number(r.created_by),
          {
            title: r.title,
            amountCents: Number(r.amount_cents),
            currency: r.currency,
            date: current,
            payerId: Number(r.payer_id),
            categoryId: r.category_id ? Number(r.category_id) : null,
            notes: r.notes,
            splitMethod: "equal",
            participants,
          },
          Number(r.id)
        );
      } catch (e) {
        console.error(`recurring ${r.id} failed to materialize:`, e);
        if (e instanceof ApiError && e.status === 400) {
          // Validation failures (e.g. payer left the group) won't heal on
          // retry: deactivate so the group view doesn't re-attempt forever.
          await sql`UPDATE recurring_expenses SET active = false WHERE id = ${r.id}`;
        } else {
          // Transient error: release the claim so the period retries later.
          await sql`UPDATE recurring_expenses SET next_date = ${current}
                    WHERE id = ${r.id} AND next_date = ${next}`;
        }
        break;
      }
      current = next;
    }
  }
}
