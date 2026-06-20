import { NextRequest } from "next/server";
import { badRequest } from "./api";
import { sql } from "./db";

const WINDOW_SECONDS = 15 * 60;
const IP_LIMIT = 120;
const ACCOUNT_LIMIT = 8;

export function clientIp(req: NextRequest): string {
  // Prefer platform-set, non-forgeable client-IP headers over the raw
  // `x-forwarded-for` left-most token, which is attacker-controlled (a client can
  // send any XFF; Vercel/most proxies APPEND the real IP rather than replacing it,
  // so the left-most value is spoofable and would hand out a fresh IP rate-limit
  // bucket per request). Vercel strips inbound `x-vercel-forwarded-for` and sets it
  // to the verified client IP, so it is trustworthy on the deployment target; fall
  // back to `x-real-ip`, then the right-most XFF hop, then the left-most.
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
