import { z } from "zod";

export const VersionToken = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
  "Invalid version"
);

export function versionToken(value: unknown): string {
  if (value instanceof Date) return formatDate(value);
  const text = String(value ?? "");
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:\+00|Z)?$/.exec(text);
  if (!match) return text;
  const [, date, time, fraction = ""] = match;
  return `${date}T${time}.${fraction.padEnd(6, "0").slice(0, 6)}Z`;
}

function formatDate(value: Date): string {
  const iso = value.toISOString();
  return iso.replace(/\.(\d{3})Z$/, ".$1000Z");
}
