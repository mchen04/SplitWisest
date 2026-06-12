import { z } from "zod";
import { sql } from "./db";
import { fmtMoney } from "./money";
import { CURRENCIES } from "./fx";
import { forbidden, notFound } from "./api";
import { isGroupMember } from "./balances";

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

export interface AuthorizedSettlement {
  id: number;
  groupId: number | null;
  payerId: number;
  recipientId: number;
  createdBy: number;
}

export interface SettlementHistoryRow {
  id: number;
  groupId: number | null;
  groupName: string | null;
  payerId: number;
  payerName: string;
  recipientId: number;
  recipientName: string;
  amountCents: number;
  currency: string;
  date: string;
  note: string;
}

function mapSettlementHistory(rows: Record<string, unknown>[]): SettlementHistoryRow[] {
  return rows.map((s) => ({
    id: Number(s.id),
    groupId: s.group_id ? Number(s.group_id) : null,
    groupName: s.group_name as string | null,
    payerId: Number(s.payer_id),
    payerName: s.payer_name as string,
    recipientId: Number(s.recipient_id),
    recipientName: s.recipient_name as string,
    amountCents: Number(s.amount_cents),
    currency: s.currency as string,
    date: s.settled_date as string,
    note: s.note as string,
  }));
}

export async function loadVisibleSettlementHistory({
  viewerId,
  personId,
  isSelf,
  isFriend,
  groupIds,
}: {
  viewerId: number;
  personId: number;
  isSelf: boolean;
  isFriend: boolean;
  groupIds: number[];
}): Promise<SettlementHistoryRow[]> {
  if (isSelf) {
    const rows = await sql`
      SELECT s.id, s.group_id, g.name AS group_name, s.payer_id, p.display_name AS payer_name,
        s.recipient_id, r.display_name AS recipient_name, s.amount_cents, s.currency,
        s.settled_date, s.note
      FROM settlements s
      LEFT JOIN groups g ON g.id = s.group_id
      JOIN users p ON p.id = s.payer_id
      JOIN users r ON r.id = s.recipient_id
      WHERE s.payer_id = ${viewerId} OR s.recipient_id = ${viewerId}
      ORDER BY s.settled_date DESC, s.id DESC
      LIMIT 20`;
    return mapSettlementHistory(rows);
  }
  if (isFriend) {
    const rows = await sql`
      SELECT s.id, s.group_id, g.name AS group_name, s.payer_id, p.display_name AS payer_name,
        s.recipient_id, r.display_name AS recipient_name, s.amount_cents, s.currency,
        s.settled_date, s.note
      FROM settlements s
      LEFT JOIN groups g ON g.id = s.group_id
      JOIN users p ON p.id = s.payer_id
      JOIN users r ON r.id = s.recipient_id
      WHERE ((s.payer_id = ${viewerId} AND s.recipient_id = ${personId})
         OR (s.payer_id = ${personId} AND s.recipient_id = ${viewerId}))
        AND (s.group_id IS NULL OR (${groupIds.length} > 0 AND s.group_id = ANY(${groupIds})))
      ORDER BY s.settled_date DESC, s.id DESC
      LIMIT 20`;
    return mapSettlementHistory(rows);
  }
  if (groupIds.length === 0) return [];
  const rows = await sql`
    SELECT s.id, s.group_id, g.name AS group_name, s.payer_id, p.display_name AS payer_name,
      s.recipient_id, r.display_name AS recipient_name, s.amount_cents, s.currency,
      s.settled_date, s.note
    FROM settlements s
    JOIN groups g ON g.id = s.group_id
    JOIN users p ON p.id = s.payer_id
    JOIN users r ON r.id = s.recipient_id
    WHERE ((s.payer_id = ${viewerId} AND s.recipient_id = ${personId})
       OR (s.payer_id = ${personId} AND s.recipient_id = ${viewerId}))
      AND s.group_id = ANY(${groupIds})
    ORDER BY s.settled_date DESC, s.id DESC
    LIMIT 20`;
  return mapSettlementHistory(rows);
}

export async function loadAuthorizedSettlementForMutation(id: number, userId: number): Promise<AuthorizedSettlement> {
  if (!Number.isInteger(id)) notFound();
  const rows = await sql`SELECT id, group_id, payer_id, recipient_id, created_by FROM settlements WHERE id = ${id}`;
  if (rows.length === 0) notFound();
  const raw = rows[0];
  const groupId = raw.group_id === null ? null : Number(raw.group_id);
  const settlement = {
    id: Number(raw.id),
    groupId,
    payerId: Number(raw.payer_id),
    recipientId: Number(raw.recipient_id),
    createdBy: Number(raw.created_by),
  };
  const allowed = groupId === null
    ? settlement.payerId === userId || settlement.recipientId === userId
    : await isGroupMember(groupId, userId);
  if (!allowed) forbidden("You can't edit this settlement");
  return settlement;
}
