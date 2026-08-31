import { Change, feedLine } from "./activity-diff";

export function activityData(data: Record<string, unknown> = {}, actionText?: string): string {
  return JSON.stringify(actionText ? { ...data, actionText } : data);
}

/** Structured field changes, when the row was written by a build that records them.
 *  Rows from before that keep rendering from their stored summary. */
export function activityChanges(data: unknown): Change[] {
  if (!data || typeof data !== "object") return [];
  const raw = (data as Record<string, unknown>).changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((c): c is Change => Boolean(c) && typeof c === "object" && "field" in c);
}

export function activityActionText(row: { summary: string; actorName: string; data?: unknown }): string {
  const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
  const line = feedLine(activityChanges(data));
  if (line) return line;
  if (typeof data.actionText === "string") return data.actionText;
  return row.summary.startsWith(row.actorName) ? row.summary.slice(row.actorName.length).trimStart() : row.summary;
}
