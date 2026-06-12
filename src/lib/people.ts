import { sql } from "./db";
import { canRemoveFriend, canRequestFriendById, canSettleDirectly, pairwiseFriendBalance } from "./balances";

export type RelationshipState = "self" | "friend" | "shared-group" | "pending" | "none";

export interface PersonProfile {
  person: {
    id: number;
    displayName: string;
    username: string;
  };
  relationship: RelationshipState;
  request: null | {
    id: number;
    direction: "incoming" | "outgoing";
    createdAt: string;
  };
  sharedGroups: {
    id: number;
    name: string;
    currency: string;
  }[];
  netByCurrency: Record<string, number>;
  recentExpenses: {
    id: number;
    groupId: number;
    groupName: string;
    title: string;
    amountCents: number;
    currency: string;
    date: string;
    payerId: number;
    payerName: string;
  }[];
  recentPayments: {
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
  }[];
  canChat: boolean;
  canSettleDirectly: boolean;
  canNudge: boolean;
  canRequestFriend: boolean;
  canRemoveFriend: boolean;
}

export async function loadPersonProfile(viewerId: number, personId: number): Promise<PersonProfile | null> {
  const users = await sql`
    SELECT id, display_name, username FROM users WHERE id = ${personId}`;
  if (users.length === 0) return null;

  const person = {
    id: Number(users[0].id),
    displayName: users[0].display_name,
    username: users[0].username,
  };

  const sharedGroups = await sql`
    SELECT g.id, g.name, g.currency
    FROM groups g
    JOIN group_members me ON me.group_id = g.id AND me.user_id = ${viewerId}
    JOIN group_members them ON them.group_id = g.id AND them.user_id = ${personId}
    ORDER BY g.name`;

  const [a, b] = viewerId < personId ? [viewerId, personId] : [personId, viewerId];
  const friendship = viewerId === personId ? [{ ok: 1 }] : await sql`
    SELECT 1 AS ok FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  const requestRows = viewerId === personId ? [] : await sql`
    SELECT id, from_id, to_id, created_at
    FROM friend_requests
    WHERE (from_id = ${viewerId} AND to_id = ${personId})
       OR (from_id = ${personId} AND to_id = ${viewerId})
    ORDER BY id DESC LIMIT 1`;

  const isSelf = viewerId === personId;
  const isFriend = !isSelf && friendship.length > 0;
  const hasSharedGroup = sharedGroups.length > 0;
  const hasPendingRequest = requestRows.length > 0;

  let relationship: RelationshipState = "none";
  if (isSelf) relationship = "self";
  else if (isFriend) relationship = "friend";
  else if (hasSharedGroup) relationship = "shared-group";
  else if (hasPendingRequest) relationship = "pending";

  if (relationship === "none") return null;

  const request = hasPendingRequest ? {
    id: Number(requestRows[0].id),
    direction: Number(requestRows[0].from_id) === viewerId ? "outgoing" as const : "incoming" as const,
    createdAt: requestRows[0].created_at,
  } : null;

  if (relationship === "pending") {
    return {
      person,
      relationship,
      request,
      sharedGroups: [],
      netByCurrency: {},
      recentExpenses: [],
      recentPayments: [],
      canChat: false,
      canSettleDirectly: false,
      canNudge: false,
      canRequestFriend: false,
      canRemoveFriend: false,
    };
  }

  const netByCurrency = isSelf ? {} : await pairwiseFriendBalance(viewerId, personId);
  const groupIds = sharedGroups.map((g) => Number(g.id));

  const recentExpenses = groupIds.length === 0 ? [] : await sql`
    SELECT e.id, e.group_id, g.name AS group_name, e.title, e.converted_cents, g.currency,
      e.expense_date, e.payer_id, p.display_name AS payer_name
    FROM expenses e
    JOIN groups g ON g.id = e.group_id
    JOIN users p ON p.id = e.payer_id
    WHERE e.group_id = ANY(${groupIds})
      AND (
        e.payer_id = ${personId}
        OR EXISTS (
          SELECT 1 FROM expense_shares es
          WHERE es.expense_id = e.id AND es.user_id = ${personId} AND es.share_cents > 0
        )
      )
    ORDER BY e.expense_date DESC, e.id DESC
    LIMIT 20`;

  const recentPayments = isSelf ? await sql`
    SELECT s.id, s.group_id, g.name AS group_name, s.payer_id, p.display_name AS payer_name,
      s.recipient_id, r.display_name AS recipient_name, s.amount_cents, s.currency,
      s.settled_date, s.note
    FROM settlements s
    LEFT JOIN groups g ON g.id = s.group_id
    JOIN users p ON p.id = s.payer_id
    JOIN users r ON r.id = s.recipient_id
    WHERE s.payer_id = ${viewerId} OR s.recipient_id = ${viewerId}
    ORDER BY s.settled_date DESC, s.id DESC
    LIMIT 20`
    : groupIds.length === 0 && !isFriend ? [] : await sql`
    SELECT s.id, s.group_id, g.name AS group_name, s.payer_id, p.display_name AS payer_name,
      s.recipient_id, r.display_name AS recipient_name, s.amount_cents, s.currency,
      s.settled_date, s.note
    FROM settlements s
    LEFT JOIN groups g ON g.id = s.group_id
    JOIN users p ON p.id = s.payer_id
    JOIN users r ON r.id = s.recipient_id
    WHERE ((s.payer_id = ${viewerId} AND s.recipient_id = ${personId})
       OR (s.payer_id = ${personId} AND s.recipient_id = ${viewerId}))
      AND (s.group_id IS NULL OR s.group_id = ANY(${groupIds}))
    ORDER BY s.settled_date DESC, s.id DESC
    LIMIT 20`;

  return {
    person,
    relationship,
    request,
    sharedGroups: sharedGroups.map((g) => ({
      id: Number(g.id),
      name: g.name,
      currency: g.currency,
    })),
    netByCurrency,
    recentExpenses: recentExpenses.map((e) => ({
      id: Number(e.id),
      groupId: Number(e.group_id),
      groupName: e.group_name,
      title: e.title,
      amountCents: Number(e.converted_cents),
      currency: e.currency,
      date: e.expense_date,
      payerId: Number(e.payer_id),
      payerName: e.payer_name,
    })),
    recentPayments: recentPayments.map((s) => ({
      id: Number(s.id),
      groupId: s.group_id ? Number(s.group_id) : null,
      groupName: s.group_name,
      payerId: Number(s.payer_id),
      payerName: s.payer_name,
      recipientId: Number(s.recipient_id),
      recipientName: s.recipient_name,
      amountCents: Number(s.amount_cents),
      currency: s.currency,
      date: s.settled_date,
      note: s.note,
    })),
    canChat: await canSettleDirectly(viewerId, personId),
    canSettleDirectly: await canSettleDirectly(viewerId, personId),
    canNudge: isFriend || hasSharedGroup,
    canRequestFriend: !request && await canRequestFriendById(viewerId, personId),
    canRemoveFriend: await canRemoveFriend(viewerId, personId),
  };
}
