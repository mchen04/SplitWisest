// Shared shaping for chat message rows. The group and DM message queries differ
// only in their WHERE clause (and neon's http tag can't compose SQL fragments),
// so the queries stay in their routes while this normalizes the result: sort
// oldest-first and map to the client DTO.
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
