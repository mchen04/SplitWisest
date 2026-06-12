import { sql } from "./db";
import { pairwiseFriendBalance } from "./balances";
import { loadRelationship, RelationshipState } from "./relationships";
import { loadVisibleSettlementHistory } from "./settlements";

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

  const { relationship, isSelf, isFriend, request, sharedGroups, capabilities } = await loadRelationship(viewerId, personId);

  if (relationship === "none") return null;

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

  const recentPayments = await loadVisibleSettlementHistory({ viewerId, personId, isSelf, isFriend, groupIds });

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
    recentPayments,
    ...capabilities(netByCurrency),
  };
}
