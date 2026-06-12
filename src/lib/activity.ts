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

export function activityActionText(summary: string, actorName: string): string {
  return summary.startsWith(actorName) ? summary.slice(actorName.length).trimStart() : summary;
}
