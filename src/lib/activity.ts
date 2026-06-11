import { sql } from "./db";

export async function logActivity(
  groupId: number | null,
  actorId: number,
  type: string,
  summary: string,
  data: Record<string, unknown> = {}
) {
  await sql`INSERT INTO activity (group_id, actor_id, type, summary, data)
            VALUES (${groupId}, ${actorId}, ${type}, ${summary}, ${JSON.stringify(data)})`;
}
