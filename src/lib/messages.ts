import { sql } from "./db";
import { orderedPair } from "./relationships";
import { likeEscape } from "./api";

export function mapMessages(rows: Record<string, unknown>[]) {
  return [...rows]
    .sort((x, y) => Number(x.id) - Number(y.id))
    .map((m) => ({
      id: Number(m.id),
      senderId: Number(m.sender_id),
      senderName: m.display_name as string,
      body: m.body as string,
      createdAt: m.created_at as string,
    }));
}

function messageQueryParams(params: URLSearchParams) {
  return {
    since: Number(params.get("since") ?? 0),
    before: Number(params.get("before") ?? 0),
    q: likeEscape(params.get("q")),
  };
}

async function loadMessagesInScope(
  scope: { groupId: number } | { dmA: number; dmB: number },
  params: URLSearchParams
) {
  const { since, before, q } = messageQueryParams(params);
  const groupId = "groupId" in scope ? scope.groupId : null;
  const dmA = "dmA" in scope ? scope.dmA : null;
  const dmB = "dmB" in scope ? scope.dmB : null;
  if (before > 0) {
    const older = await sql`
      SELECT * FROM (
        SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
        FROM messages m JOIN users u ON u.id = m.sender_id
        WHERE m.id < ${before}
          AND ((${groupId}::bigint IS NOT NULL AND m.channel = 'group' AND m.group_id = ${groupId})
            OR (${dmA}::bigint IS NOT NULL AND m.channel = 'dm' AND m.dm_a = ${dmA} AND m.dm_b = ${dmB}))
        ORDER BY m.id DESC LIMIT 101
      ) sub ORDER BY id ASC`;
    const hasMore = older.length > 100;
    return { messages: mapMessages(hasMore ? older.slice(1) : older), hasMore };
  }
  if (since > 0 || q) {
    const rows = await sql`
      SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.id > ${since}
        AND ((${groupId}::bigint IS NOT NULL AND m.channel = 'group' AND m.group_id = ${groupId})
          OR (${dmA}::bigint IS NOT NULL AND m.channel = 'dm' AND m.dm_a = ${dmA} AND m.dm_b = ${dmB}))
        AND (${q}::text IS NULL OR m.body ILIKE '%' || ${q} || '%' ESCAPE '\')
      ORDER BY m.id DESC LIMIT 200`;
    return { messages: mapMessages(rows) };
  }
  const rows = await sql`
    SELECT * FROM (
      SELECT m.id, m.sender_id, m.body, m.created_at, u.display_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE ((${groupId}::bigint IS NOT NULL AND m.channel = 'group' AND m.group_id = ${groupId})
        OR (${dmA}::bigint IS NOT NULL AND m.channel = 'dm' AND m.dm_a = ${dmA} AND m.dm_b = ${dmB}))
      ORDER BY m.id DESC LIMIT 101
    ) sub ORDER BY id ASC`;
  const hasMore = rows.length > 100;
  return { messages: mapMessages(hasMore ? rows.slice(1) : rows), hasMore };
}

export async function loadGroupMessages(groupId: number, params: URLSearchParams) {
  return loadMessagesInScope({ groupId }, params);
}

export async function loadDirectMessages(dmA: number, dmB: number, params: URLSearchParams) {
  return loadMessagesInScope({ dmA, dmB }, params);
}

export async function insertGroupMessage(groupId: number, senderId: number, body: string): Promise<number | null> {
  const [, rows] = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(${groupId}::int)`,
    tx`
    INSERT INTO messages (channel, group_id, sender_id, body)
    SELECT 'group', g.id, ${senderId}, ${body}
    FROM groups g
    WHERE g.id = ${groupId}
      AND EXISTS (
        SELECT 1 FROM group_members
        WHERE group_id = ${groupId} AND user_id = ${senderId}
      )
    RETURNING id`,
  ]);
  return rows[0] ? Number(rows[0].id) : null;
}

export async function insertDirectMessage(userId: number, friendId: number, body: string): Promise<number | null> {
  const [a, b] = orderedPair(userId, friendId);
  const [, rows] = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(${a}::int, ${b}::int)`,
    tx`
    INSERT INTO messages (channel, dm_a, dm_b, sender_id, body)
    SELECT 'dm', ${a}, ${b}, ${userId}, ${body}
    WHERE EXISTS (
      SELECT 1 FROM friendships
      WHERE user_a = ${a} AND user_b = ${b}
    )
    RETURNING id`,
  ]);
  return rows[0] ? Number(rows[0].id) : null;
}
