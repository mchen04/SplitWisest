const MESSAGE_BURST_GAP_MS = 60 * 60 * 1000;

export function startsMessageBurst(current: string, previous?: string): boolean {
  if (!previous) return true;
  const currentDate = new Date(current);
  const previousDate = new Date(previous);
  const dateChanged = currentDate.toDateString() !== previousDate.toDateString();
  return dateChanged || currentDate.getTime() - previousDate.getTime() >= MESSAGE_BURST_GAP_MS;
}
