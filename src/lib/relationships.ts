import { sql } from "./db";
import { forbidden } from "./api";
import { pairwiseFriendBalance } from "./balances";

export type RelationshipState = "self" | "friend" | "shared-group" | "pending" | "none";
export interface RelationshipCapabilities {
  canChat: boolean;
  canSettleDirectly: boolean;
  canNudge: boolean;
  canRequestFriend: boolean;
  canRemoveFriend: boolean;
}

export function orderedPair(userId: number, otherId: number): [number, number] {
  return otherId < userId ? [otherId, userId] : [userId, otherId];
}

export async function friendshipExists(userId: number, friendId: number): Promise<boolean> {
  const [a, b] = orderedPair(userId, friendId);
  const rows = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  return rows.length > 0;
}

export async function createFriendship(userId: number, friendId: number) {
  const [a, b] = orderedPair(userId, friendId);
  await sql`
    WITH inserted AS (
      INSERT INTO friendships (user_a, user_b)
      VALUES (${a}, ${b})
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    DELETE FROM friend_requests
    WHERE (from_id = ${userId} AND to_id = ${friendId})
       OR (from_id = ${friendId} AND to_id = ${userId})`;
}

export async function removeFriendship(userId: number, friendId: number) {
  const [a, b] = orderedPair(userId, friendId);
  await sql`DELETE FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
}

export async function createFriendRequest(fromId: number, toId: number) {
  await sql`
    INSERT INTO friend_requests (from_id, to_id) VALUES (${fromId}, ${toId})
    ON CONFLICT (from_id, to_id) DO NOTHING`;
}

export async function joinGroupAndFriendMembers(groupId: number, userId: number) {
  await sql`
    WITH existing_members AS (
      SELECT user_id
      FROM group_members
      WHERE group_id = ${groupId} AND user_id <> ${userId}
    ),
    added_member AS (
      INSERT INTO group_members (group_id, user_id)
      VALUES (${groupId}, ${userId})
      ON CONFLICT DO NOTHING
      RETURNING user_id
    ),
    inserted_friendships AS (
      INSERT INTO friendships (user_a, user_b)
      SELECT LEAST(${userId}, user_id), GREATEST(${userId}, user_id)
      FROM existing_members
      ON CONFLICT DO NOTHING
      RETURNING user_a, user_b
    )
    DELETE FROM friend_requests fr
    USING existing_members em
    WHERE (fr.from_id = ${userId} AND fr.to_id = em.user_id)
       OR (fr.from_id = em.user_id AND fr.to_id = ${userId})`;
}
export async function cancelFriendRequest(requestId: number) {
  await sql`DELETE FROM friend_requests WHERE id = ${requestId}`;
}

export async function loadRelationship(viewerId: number, personId: number): Promise<{
  relationship: RelationshipState;
  isSelf: boolean;
  isFriend: boolean;
  hasSharedGroup: boolean;
  sharedGroups: { id: number; name: string; currency: string }[];
  hasPendingRequest: boolean;
  request: null | { id: number; direction: "incoming" | "outgoing"; createdAt: string };
  capabilities: (netByCurrency: Record<string, number>) => RelationshipCapabilities;
}> {
  const isSelf = viewerId === personId;
  const [friendship, sharedGroups, requestRows] = await Promise.all([
    isSelf ? Promise.resolve([{ ok: 1 }]) : friendshipExists(viewerId, personId).then((ok) => ok ? [{ ok: 1 }] : []),
    isSelf ? Promise.resolve([]) : sql`
      SELECT g.id, g.name, g.currency
      FROM group_members me
      JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${personId}
      JOIN groups g ON g.id = me.group_id
      WHERE me.user_id = ${viewerId}
      ORDER BY g.name`,
    isSelf ? Promise.resolve([]) : sql`
      SELECT id, from_id, to_id, created_at
      FROM friend_requests
      WHERE (from_id = ${viewerId} AND to_id = ${personId})
         OR (from_id = ${personId} AND to_id = ${viewerId})
      ORDER BY id DESC LIMIT 1`,
  ]);
  const isFriend = !isSelf && friendship.length > 0;
  const hasSharedGroup = sharedGroups.length > 0;
  const hasPendingRequest = requestRows.length > 0;
  let relationship: RelationshipState = "none";
  if (isSelf) relationship = "self";
  else if (isFriend) relationship = "friend";
  else if (hasSharedGroup) relationship = "shared-group";
  else if (hasPendingRequest) relationship = "pending";
  return {
    relationship,
    isSelf,
    isFriend,
    hasSharedGroup,
    sharedGroups: sharedGroups.map((g) => ({ id: Number(g.id), name: g.name, currency: g.currency })),
    hasPendingRequest,
    request: hasPendingRequest ? {
      id: Number(requestRows[0].id),
      direction: Number(requestRows[0].from_id) === viewerId ? "outgoing" : "incoming",
      createdAt: requestRows[0].created_at,
    } : null,
    capabilities: (netByCurrency) => ({
      canChat: isFriend,
      canSettleDirectly: isFriend,
      canNudge: isFriend || hasSharedGroup,
      canRequestFriend: hasSharedGroup && !isFriend && !hasPendingRequest,
      canRemoveFriend: isFriend && Object.keys(netByCurrency).length === 0,
    }),
  };
}

export async function shareAnyGroup(userId: number, otherId: number): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM group_members me
    JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${otherId}
    WHERE me.user_id = ${userId}
    LIMIT 1`;
  return rows.length > 0;
}

export async function shareGroup(groupId: number, userId: number, otherId: number): Promise<boolean> {
  const rows = await sql`
    SELECT
      (SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}) AS me,
      (SELECT 1 FROM group_members WHERE group_id = ${groupId} AND user_id = ${otherId}) AS them`;
  return !!rows[0]?.me && !!rows[0]?.them;
}

export async function canNudgeUser(userId: number, toId: number, groupId: number | null): Promise<boolean> {
  return groupId ? shareGroup(groupId, userId, toId) : friendshipExists(userId, toId);
}

export async function canRequestFriendById(userId: number, friendId: number): Promise<boolean> {
  return userId !== friendId && await shareAnyGroup(userId, friendId) && !(await friendshipExists(userId, friendId));
}

export async function canSettleDirectly(userId: number, friendId: number): Promise<boolean> {
  return userId !== friendId && await friendshipExists(userId, friendId);
}

export async function requireFriendship(userId: number, friendId: number): Promise<[number, number]> {
  const [a, b] = orderedPair(userId, friendId);
  if (!(await friendshipExists(userId, friendId))) {
    forbidden("You are not friends with this user");
  }
  return [a, b];
}

export async function canRemoveFriend(userId: number, friendId: number): Promise<boolean> {
  return await friendshipExists(userId, friendId)
    && Object.keys(await pairwiseFriendBalance(userId, friendId)).length === 0;
}
