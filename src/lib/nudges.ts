import { sql } from "./db";
import { orderedPair } from "./relationships";

export async function upsertNudge({
  fromId,
  toId,
  groupId,
  note,
}: {
  fromId: number;
  toId: number;
  groupId: number | null;
  note: string;
}): Promise<number | null> {
  if (groupId !== null) {
    const [, rows] = await sql.transaction((tx) => [
      tx`SELECT pg_advisory_xact_lock(${groupId}::int)`,
      tx`
      WITH authorized AS (
        SELECT 1
        WHERE EXISTS (
          SELECT 1 FROM group_members
          WHERE group_id = ${groupId} AND user_id = ${fromId}
        )
        AND EXISTS (
          SELECT 1 FROM group_members
          WHERE group_id = ${groupId} AND user_id = ${toId}
        )
      ),
      existing AS (
        SELECT id FROM nudges
        WHERE from_id = ${fromId} AND to_id = ${toId} AND seen_at IS NULL
          AND group_id = ${groupId}
      ),
      upd AS (
        UPDATE nudges SET note = ${note}, created_at = now()
        FROM authorized, existing
        WHERE nudges.id = existing.id
        RETURNING nudges.id
      ),
      ins AS (
        INSERT INTO nudges (from_id, to_id, group_id, note)
        SELECT ${fromId}, ${toId}, ${groupId}, ${note}
        FROM authorized
        WHERE NOT EXISTS (SELECT 1 FROM existing)
        RETURNING id
      )
      SELECT id FROM upd
      UNION ALL
      SELECT id FROM ins`,
    ]);
    return rows[0] ? Number(rows[0].id) : null;
  }

  const [a, b] = orderedPair(fromId, toId);
  const [, rows] = await sql.transaction((tx) => [
    tx`SELECT pg_advisory_xact_lock(${a}::int, ${b}::int)`,
    tx`
    WITH authorized AS (
      SELECT 1
      WHERE EXISTS (
        SELECT 1 FROM friendships
        WHERE user_a = ${a} AND user_b = ${b}
      )
    ),
    existing AS (
      SELECT id FROM nudges
      WHERE from_id = ${fromId} AND to_id = ${toId} AND seen_at IS NULL
        AND group_id IS NULL
    ),
    upd AS (
      UPDATE nudges SET note = ${note}, created_at = now()
      FROM authorized, existing
      WHERE nudges.id = existing.id
      RETURNING nudges.id
    ),
    ins AS (
      INSERT INTO nudges (from_id, to_id, group_id, note)
      SELECT ${fromId}, ${toId}, null, ${note}
      FROM authorized
      WHERE NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    )
    SELECT id FROM upd
    UNION ALL
    SELECT id FROM ins`,
  ]);
  return rows[0] ? Number(rows[0].id) : null;
}
