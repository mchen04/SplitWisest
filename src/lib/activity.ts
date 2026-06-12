export function activityData(data: Record<string, unknown> = {}, actionText?: string): string {
  return JSON.stringify(actionText ? { ...data, actionText } : data);
}

export function activityActionText(row: { summary: string; actorName: string; data?: unknown }): string {
  const data = row.data && typeof row.data === "object" ? row.data as Record<string, unknown> : {};
  if (typeof data.actionText === "string") return data.actionText;
  return row.summary.startsWith(row.actorName) ? row.summary.slice(row.actorName.length).trimStart() : row.summary;
}
