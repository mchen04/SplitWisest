import { sql } from "./db";
import { forbidden } from "./api";
import { activityData } from "./activity";

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

export async function requestOrAcceptFriendship({
  actorId,
  actorName,
  friendId,
  friendName,
  requireSharedGroup = false,
}: {
  actorId: number;
  actorName: string;
  friendId: number;
  friendName: string;
  requireSharedGroup?: boolean;
}): Promise<"accepted" | "requested" | "already-friends" | "shared-group-required"> {
  const actionText = `and ${friendName} are now friends`;
  const summary = `${actorName} ${actionText}`;
  const [, rows] = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(LEAST(${actorId}::bigint, ${friendId}::bigint)::int, GREATEST(${actorId}::bigint, ${friendId}::bigint)::int)`,
    tx`
    WITH existing_friendship AS (
      SELECT 1
      FROM friendships
      WHERE user_a = LEAST(${actorId}::bigint, ${friendId}::bigint) AND user_b = GREATEST(${actorId}::bigint, ${friendId}::bigint)
    ),
    accepted_request AS (
      DELETE FROM friend_requests
      WHERE from_id = ${friendId} AND to_id = ${actorId}
        AND NOT EXISTS (SELECT 1 FROM existing_friendship)
      RETURNING from_id, to_id
    ),
    shared_group_ok AS (
      SELECT 1
      WHERE ${requireSharedGroup}::boolean = false
        OR EXISTS (
          SELECT 1
          FROM group_members me
          JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${friendId}
          WHERE me.user_id = ${actorId}
        )
    ),
    inserted_friendship AS (
      INSERT INTO friendships (user_a, user_b)
      SELECT LEAST(from_id, to_id), GREATEST(from_id, to_id) FROM accepted_request
      ON CONFLICT DO NOTHING
      RETURNING user_a, user_b
    ),
    deleted_other_requests AS (
      DELETE FROM friend_requests
      USING accepted_request ar
      WHERE friend_requests.from_id = ar.to_id AND friend_requests.to_id = ar.from_id
      RETURNING 1
    ),
    requested AS (
      INSERT INTO friend_requests (from_id, to_id)
      SELECT ${actorId}, ${friendId}
      WHERE NOT EXISTS (SELECT 1 FROM existing_friendship)
        AND NOT EXISTS (SELECT 1 FROM accepted_request)
        AND EXISTS (SELECT 1 FROM shared_group_ok)
      ON CONFLICT (LEAST(from_id, to_id), GREATEST(from_id, to_id)) DO NOTHING
      RETURNING 1
    ),
    current_request AS (
      SELECT 1 FROM friend_requests
      WHERE LEAST(from_id, to_id) = LEAST(${actorId}::bigint, ${friendId}::bigint)
        AND GREATEST(from_id, to_id) = GREATEST(${actorId}::bigint, ${friendId}::bigint)
    ),
    current_friendship AS (
      SELECT 1
      FROM friendships
      WHERE user_a = LEAST(${actorId}::bigint, ${friendId}::bigint) AND user_b = GREATEST(${actorId}::bigint, ${friendId}::bigint)
    ),
    activity_row AS (
      INSERT INTO activity (group_id, actor_id, type, summary, data)
      SELECT null, ${actorId}, 'friend.added', ${summary},
        ${activityData({ visibleUserIds: [String(actorId), String(friendId)] }, actionText)}::jsonb
      FROM inserted_friendship
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM existing_friendship)::int AS already_friends,
      (SELECT count(*) FROM inserted_friendship)::int AS accepted,
      (SELECT count(*) FROM requested)::int AS requested,
      (SELECT count(*) FROM shared_group_ok)::int AS shared_group_ok,
      (SELECT count(*) FROM current_request)::int AS current_request,
      (SELECT count(*) FROM current_friendship)::int AS current_friendship`,
  ]);
  if (Number(rows[0]?.already_friends ?? 0) > 0) return "already-friends";
  if (Number(rows[0]?.accepted ?? 0) > 0) return "accepted";
  if (Number(rows[0]?.current_friendship ?? 0) > 0) return "already-friends";
  if (Number(rows[0]?.requested ?? 0) > 0 || Number(rows[0]?.current_request ?? 0) > 0) return "requested";
  if (Number(rows[0]?.shared_group_ok ?? 0) === 0) return "shared-group-required";
  return "already-friends";
}

export async function acceptFriendRequestWithActivity({
  requestId,
  actorId,
  actorName,
}: {
  requestId: number;
  actorId: number;
  actorName: string;
}): Promise<"accepted" | "missing" | "already-friends"> {
  const actionText = "accepted a friend request";
  const summary = `${actorName} ${actionText}`;
  const [, rows] = await sql.transaction((tx) => [
    tx`
    WITH request_row AS (
      SELECT from_id, to_id FROM friend_requests
      WHERE id = ${requestId} AND to_id = ${actorId}
    )
      SELECT pg_advisory_xact_lock(LEAST(from_id, to_id)::int, GREATEST(from_id, to_id)::int)
      FROM request_row`,
    tx`
    WITH accepted_request AS (
      DELETE FROM friend_requests
      WHERE id = ${requestId} AND to_id = ${actorId}
      RETURNING from_id, to_id
    ),
    existing_friendship AS (
      SELECT 1
      FROM friendships f
      JOIN accepted_request ar
        ON f.user_a = LEAST(ar.from_id, ar.to_id) AND f.user_b = GREATEST(ar.from_id, ar.to_id)
    ),
    inserted AS (
      INSERT INTO friendships (user_a, user_b)
      SELECT LEAST(from_id, to_id), GREATEST(from_id, to_id) FROM accepted_request
      WHERE NOT EXISTS (SELECT 1 FROM existing_friendship)
      ON CONFLICT DO NOTHING
      RETURNING user_a, user_b
    ),
    deleted_other_requests AS (
      DELETE FROM friend_requests
      USING accepted_request ar
      WHERE (friend_requests.from_id = ar.to_id AND friend_requests.to_id = ar.from_id)
      RETURNING 1
    ),
    activity_row AS (
      INSERT INTO activity (group_id, actor_id, type, summary, data)
      SELECT null, ${actorId}, 'friend.added', ${summary},
        jsonb_build_object(
          'actionText', ${actionText}::text,
          'visibleUserIds', jsonb_build_array(ar.from_id::text, ar.to_id::text)
        )
      FROM inserted i
      JOIN accepted_request ar ON LEAST(ar.from_id, ar.to_id) = i.user_a AND GREATEST(ar.from_id, ar.to_id) = i.user_b
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM accepted_request)::int AS accepted,
      (SELECT count(*) FROM existing_friendship)::int AS already_friends,
      (SELECT count(*) FROM inserted)::int AS inserted`,
  ]);
  const accepted = Number(rows[0]?.accepted ?? 0);
  const alreadyFriends = Number(rows[0]?.already_friends ?? 0);
  const inserted = Number(rows[0]?.inserted ?? 0);
  if (accepted === 0) return "missing";
  if (alreadyFriends > 0) return "already-friends";
  return inserted > 0 ? "accepted" : "already-friends";
}

export async function removeFriendshipWithActivity(user: { id: number; displayName: string }, friendId: number) {
  const [a, b] = orderedPair(user.id, friendId);
  const actionText = "removed a friend";
  const summary = `${user.displayName} ${actionText}`;
  const results = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(${a}::int, ${b}::int)`,
    tx`
    WITH RECURSIVE shared_groups AS MATERIALIZED (
      SELECT me.group_id, row_number() OVER (ORDER BY me.group_id) AS lock_order
      FROM group_members me
      JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${friendId}
      WHERE me.user_id = ${user.id}
    ),
    group_locks(lock_order, group_id, locked) AS (
      SELECT lock_order, group_id, pg_advisory_xact_lock(group_id::int) AS locked
      FROM shared_groups
      WHERE lock_order = 1
      UNION ALL
      SELECT sg.lock_order, sg.group_id, pg_advisory_xact_lock(sg.group_id::int) AS locked
      FROM group_locks gl
      JOIN shared_groups sg ON sg.lock_order = gl.lock_order + 1
    )
    SELECT count(*) FROM group_locks`,
    tx`
    WITH direct_totals AS (
      SELECT currency,
        SUM(CASE WHEN payer_id = ${user.id} THEN converted_cents ELSE -converted_cents END) AS net_cents
      FROM settlements
      WHERE group_id IS NULL
        AND ((payer_id = ${user.id} AND recipient_id = ${friendId})
          OR (payer_id = ${friendId} AND recipient_id = ${user.id}))
      GROUP BY currency
    ),
    shared_groups AS (
      SELECT me.group_id, g.currency
      FROM group_members me
      JOIN group_members them ON them.group_id = me.group_id AND them.user_id = ${friendId}
      JOIN groups g ON g.id = me.group_id
      WHERE me.user_id = ${user.id}
    ),
    adjusted_nets AS (
      SELECT sg.group_id, b.user_id, b.net_cents
      FROM shared_groups sg
      CROSS JOIN LATERAL group_balance_rows(sg.group_id) b
    ),
    creditors AS (
      SELECT group_id, user_id, net_cents AS amount
      FROM adjusted_nets
      WHERE net_cents > 0
    ),
    debtors AS (
      SELECT group_id, user_id, -net_cents AS amount
      FROM adjusted_nets
      WHERE net_cents < 0
    ),
    creditor_intervals AS (
      SELECT group_id, user_id,
        COALESCE(SUM(amount) OVER (
          PARTITION BY group_id ORDER BY amount DESC, user_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS start_cents,
        SUM(amount) OVER (
          PARTITION BY group_id ORDER BY amount DESC, user_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS end_cents
      FROM creditors
    ),
    debtor_intervals AS (
      SELECT group_id, user_id,
        COALESCE(SUM(amount) OVER (
          PARTITION BY group_id ORDER BY amount DESC, user_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0) AS start_cents,
        SUM(amount) OVER (
          PARTITION BY group_id ORDER BY amount DESC, user_id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS end_cents
      FROM debtors
    ),
    group_pair_transfers AS (
      SELECT sg.currency,
        CASE
          WHEN d.user_id = ${user.id} AND c.user_id = ${friendId}
            THEN -LEAST(d.end_cents, c.end_cents) + GREATEST(d.start_cents, c.start_cents)
          ELSE LEAST(d.end_cents, c.end_cents) - GREATEST(d.start_cents, c.start_cents)
        END AS net_cents
      FROM debtor_intervals d
      JOIN creditor_intervals c ON c.group_id = d.group_id
      JOIN shared_groups sg ON sg.group_id = d.group_id
      WHERE ((d.user_id = ${user.id} AND c.user_id = ${friendId})
          OR (d.user_id = ${friendId} AND c.user_id = ${user.id}))
        AND LEAST(d.end_cents, c.end_cents) > GREATEST(d.start_cents, c.start_cents)
    ),
    combined_balance AS (
      SELECT currency, SUM(net_cents) AS net_cents
      FROM (
        SELECT currency, net_cents FROM direct_totals
        UNION ALL
        SELECT currency, net_cents FROM group_pair_transfers
      ) balances
      GROUP BY currency
      HAVING SUM(net_cents) <> 0
    ),
    deleted AS (
      DELETE FROM friendships
      WHERE user_a = ${a} AND user_b = ${b}
        AND NOT EXISTS (SELECT 1 FROM combined_balance)
      RETURNING 1
    ),
    activity_row AS (
      INSERT INTO activity (group_id, actor_id, type, summary, data)
      SELECT null, ${user.id}, 'friend.removed', ${summary},
        ${activityData({ visibleUserIds: [String(user.id), String(friendId)] }, actionText)}::jsonb
      FROM deleted
      RETURNING 1
    )
    SELECT
      (SELECT count(*) FROM deleted)::int AS deleted,
      (SELECT count(*) FROM direct_totals WHERE net_cents <> 0)::int AS direct_balance_count,
      (SELECT count(*) FROM group_pair_transfers WHERE net_cents <> 0)::int AS shared_group_balance_count,
      (SELECT count(*) FROM combined_balance)::int AS combined_balance_count`,
  ]);
  const rows = results[results.length - 1];
  return {
    removed: Number(rows[0]?.deleted ?? 0) > 0,
    hasDirectBalance: Number(rows[0]?.direct_balance_count ?? 0) > 0,
    hasSharedGroupBalance: Number(rows[0]?.shared_group_balance_count ?? 0) > 0,
    hasBalance: Number(rows[0]?.combined_balance_count ?? 0) > 0,
  };
}

export async function joinGroupAndFriendMembers(groupId: number, user: { id: number; displayName: string }): Promise<boolean> {
  const summary = `${user.displayName} joined the group`;
  const results = await sql.transaction((tx) => [
    tx`
    WITH RECURSIVE existing_members AS MATERIALIZED (
      SELECT user_id, row_number() OVER (ORDER BY user_id) AS lock_order
      FROM group_members
      WHERE group_id = ${groupId} AND user_id <> ${user.id}
    ),
    pair_locks(lock_order, user_id, locked) AS (
      SELECT lock_order, user_id,
        pg_advisory_xact_lock(LEAST(${user.id}::bigint, user_id)::int, GREATEST(${user.id}::bigint, user_id)::int) AS locked
      FROM existing_members
      WHERE lock_order = 1
      UNION ALL
      SELECT em.lock_order, em.user_id,
        pg_advisory_xact_lock(LEAST(${user.id}::bigint, em.user_id)::int, GREATEST(${user.id}::bigint, em.user_id)::int) AS locked
      FROM pair_locks pl
      JOIN existing_members em ON em.lock_order = pl.lock_order + 1
    )
    SELECT count(*) FROM pair_locks`,
    tx`SELECT pg_advisory_xact_lock(${groupId}::int)`,
    tx`
    WITH RECURSIVE existing_members AS MATERIALIZED (
      SELECT user_id, row_number() OVER (ORDER BY user_id) AS lock_order
      FROM group_members
      WHERE group_id = ${groupId} AND user_id <> ${user.id}
    ),
    pair_locks(lock_order, user_id, locked) AS (
      SELECT lock_order, user_id,
        pg_advisory_xact_lock(LEAST(${user.id}::bigint, user_id)::int, GREATEST(${user.id}::bigint, user_id)::int) AS locked
      FROM existing_members
      WHERE lock_order = 1
      UNION ALL
      SELECT em.lock_order, em.user_id,
        pg_advisory_xact_lock(LEAST(${user.id}::bigint, em.user_id)::int, GREATEST(${user.id}::bigint, em.user_id)::int) AS locked
      FROM pair_locks pl
      JOIN existing_members em ON em.lock_order = pl.lock_order + 1
    )
    SELECT count(*) FROM pair_locks`,
    tx`
    WITH existing_group AS (
      SELECT id
      FROM groups
      WHERE id = ${groupId}
    ),
    existing_members AS (
      SELECT user_id
      FROM group_members
      WHERE group_id = ${groupId} AND user_id <> ${user.id}
    ),
    added_member AS (
      INSERT INTO group_members (group_id, user_id)
      SELECT id, ${user.id}
      FROM existing_group
      ON CONFLICT DO NOTHING
      RETURNING user_id
    ),
    inserted_friendships AS (
      INSERT INTO friendships (user_a, user_b)
      SELECT LEAST(${user.id}::bigint, user_id), GREATEST(${user.id}::bigint, user_id)
      FROM existing_members
      WHERE EXISTS (SELECT 1 FROM added_member)
      ON CONFLICT DO NOTHING
      RETURNING user_a, user_b
    ),
    deleted_requests AS (
      DELETE FROM friend_requests fr
      USING existing_members em
      WHERE EXISTS (SELECT 1 FROM added_member)
        AND ((fr.from_id = ${user.id} AND fr.to_id = em.user_id)
          OR (fr.from_id = em.user_id AND fr.to_id = ${user.id}))
      RETURNING 1
    ),
    a AS (
      INSERT INTO activity (group_id, actor_id, type, summary, data)
      SELECT ${groupId}, ${user.id}, 'group.joined', ${summary},
        ${activityData({}, "joined the group")}::jsonb
      FROM added_member
      RETURNING 1
    )
    SELECT
      EXISTS (SELECT 1 FROM existing_group) AS group_exists,
      EXISTS (SELECT 1 FROM added_member) AS joined`,
  ]);
  const rows = results[results.length - 1];
  return Boolean(rows[0]?.group_exists);
}
export async function cancelFriendRequest(requestId: number, actorId: number): Promise<boolean> {
  const [, rows] = await sql.transaction((tx) => [
    tx`
    WITH request_row AS (
      SELECT from_id, to_id FROM friend_requests
      WHERE id = ${requestId} AND from_id = ${actorId}
    )
      SELECT pg_advisory_xact_lock(LEAST(from_id, to_id)::int, GREATEST(from_id, to_id)::int)
      FROM request_row`,
    tx`
    DELETE FROM friend_requests
    WHERE id = ${requestId} AND from_id = ${actorId}
    RETURNING 1`,
  ]);
  return rows.length > 0;
}

export async function declineFriendRequest(requestId: number, actorId: number): Promise<boolean> {
  const [, rows] = await sql.transaction((tx) => [
    tx`
    WITH request_row AS (
      SELECT from_id, to_id FROM friend_requests
      WHERE id = ${requestId} AND to_id = ${actorId}
    )
      SELECT pg_advisory_xact_lock(LEAST(from_id, to_id)::int, GREATEST(from_id, to_id)::int)
      FROM request_row`,
    tx`
    DELETE FROM friend_requests
    WHERE id = ${requestId} AND to_id = ${actorId}
    RETURNING 1`,
  ]);
  return rows.length > 0;
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
