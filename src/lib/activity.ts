import { sql } from "./db";

export async function logActivity(
  groupId: number | null,
  actorId: number,
  type: string,
  summary: string,
  data: Record<string, unknown> = {},
  actionText?: string
) {
  const payload = actionText ? { ...data, actionText } : data;
  await sql`INSERT INTO activity (group_id, actor_id, type, summary, data)
            VALUES (${groupId}, ${actorId}, ${type}, ${summary}, ${JSON.stringify(payload)})`;
}

export function activityActionText(row: { summary: string; actorName: string; data?: unknown }): string {
  const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
  if (typeof data.actionText === "string") return data.actionText;
  return row.summary.startsWith(row.actorName) ? row.summary.slice(row.actorName.length).trimStart() : row.summary;
}
