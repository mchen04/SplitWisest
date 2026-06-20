import { NextRequest } from "next/server";
import { badRequest } from "./api";
import { sql } from "./db";

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 120;
const ACCOUNT_LIMIT = 8;

export function clientIp(req: NextRequest): string {
  // On the deployment target (Vercel) `x-vercel-forwarded-for` is set by the edge
  // and inbound copies are stripped, so it is a trustworthy, non-forgeable client
  // IP — preferred here. The raw `x-forwarded-for` LEFT-most token is fully
  // attacker-controlled (Vercel/most proxies append the real IP, so a client can
  // forge the left value and mint a fresh IP bucket per request); we avoid it.
  // IMPORTANT: off a trusted proxy (self-host / direct access), neither
  // `x-real-ip` nor any XFF position is guaranteed, so the IP limiter is
  // best-effort there. The real protection against credential attacks is the
  // PER-ACCOUNT limiter (keyed on the normalized username, which an attacker
  // cannot vary), which this IP path never substitutes for.
  const vercel = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    // Right-most hop is the one closest to our infra and the hardest to spoof past.
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return "unknown";
}

export async function assertAuthRateLimit(req: NextRequest, action: string, accountKey: string) {
  const ipKey = clientIp(req);
  const normalizedAccount = accountKey.trim().toLowerCase() || "unknown";
  const [ipRows, accountRows] = await sql.transaction((tx) => [
    tx`
      INSERT INTO auth_rate_limits (scope, key, window_start, attempts)
      VALUES (${`${action}:ip`}, ${ipKey}, now(), 1)
      ON CONFLICT (scope, key) DO UPDATE SET
        window_start = CASE
          WHEN auth_rate_limits.window_start < now() - ${`${WINDOW_SECONDS} seconds`}::interval THEN now()
          ELSE auth_rate_limits.window_start
        END,
        attempts = CASE
          WHEN auth_rate_limits.window_start < now() - ${`${WINDOW_SECONDS} seconds`}::interval THEN 1
          ELSE auth_rate_limits.attempts + 1
        END
      RETURNING attempts`,
    tx`
      INSERT INTO auth_rate_limits (scope, key, window_start, attempts)
      VALUES (${`${action}:account`}, ${normalizedAccount}, now(), 1)
      ON CONFLICT (scope, key) DO UPDATE SET
        window_start = CASE
          WHEN auth_rate_limits.window_start < now() - ${`${WINDOW_SECONDS} seconds`}::interval THEN now()
          ELSE auth_rate_limits.window_start
        END,
        attempts = CASE
          WHEN auth_rate_limits.window_start < now() - ${`${WINDOW_SECONDS} seconds`}::interval THEN 1
          ELSE auth_rate_limits.attempts + 1
        END
      RETURNING attempts`,
  ]);
  if (Number(ipRows[0]?.attempts ?? 0) > IP_LIMIT || Number(accountRows[0]?.attempts ?? 0) > ACCOUNT_LIMIT) {
    badRequest("Too many attempts. Try again later.");
  }
}

export async function clearAuthRateLimit(action: string, accountKey: string) {
  await sql`
    DELETE FROM auth_rate_limits
    WHERE scope = ${`${action}:account`}
      AND key = ${accountKey.trim().toLowerCase() || "unknown"}`;
}
