import { sql } from "./db";
import { pairwiseFriendBalance } from "./balances";

export async function friendshipExists(userId: number, friendId: number): Promise<boolean> {
  const [a, b] = friendId < userId ? [friendId, userId] : [userId, friendId];
  const rows = await sql`SELECT 1 FROM friendships WHERE user_a = ${a} AND user_b = ${b}`;
  return rows.length > 0;
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

export async function canRemoveFriend(userId: number, friendId: number): Promise<boolean> {
  return await friendshipExists(userId, friendId)
    && Object.keys(await pairwiseFriendBalance(userId, friendId)).length === 0;
}
