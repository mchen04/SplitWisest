import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { sql } from "./db";

const SESSION_COOKIE = "sw_session";
const SESSION_DAYS = 30;
const DUMMY_HASH = "scrypt:0123456789abcdef0123456789abcdef:" + "ab".repeat(64);
const RECOVERY_CODE_CHECKS = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function verifyPasswordForLogin(password: string, stored: string | null | undefined): boolean {
  return verifyPassword(password, stored ?? DUMMY_HASH) && !!stored;
}

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

// Recovery codes are short, human-typable, and shown to the user exactly once.
// We store only their scrypt hash, so a DB leak can't reveal them.
export function newRecoveryCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export function hashRecoveryCode(code: string): string {
  return hashPassword(code.trim().toUpperCase());
}

export function verifyRecoveryCode(code: string, stored: string): boolean {
  return verifyPassword(code.trim().toUpperCase(), stored);
}

export function matchingRecoveryCodeId(
  code: string,
  candidates: { id: number; codeHash: string }[],
): number | null {
  let match: number | null = null;
  const checks = Math.max(RECOVERY_CODE_CHECKS, candidates.length);
  for (let i = 0; i < checks; i++) {
    const candidate = candidates[i];
    const matched = verifyRecoveryCode(code, candidate?.codeHash ?? DUMMY_HASH);
    if (matched && candidate && match === null) match = candidate.id;
  }
  return match;
}

export function newInviteCode(): string {
  return randomBytes(16).toString("hex");
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  inviteCode: string;
}

export async function createSession(userId: number): Promise<string> {
  const token = newToken();
  await sql`INSERT INTO sessions (token, user_id, expires_at)
            VALUES (${token}, ${userId}, now() + ${SESSION_DAYS + " days"}::interval)`;
  return token;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 86400,
    path: "/",
  });
}

export async function clearSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token = ${token}`;
  store.delete(SESSION_COOKIE);
}

export async function revokeOtherSessions(userId: number) {
  const store = await cookies();
  const keep = store.get(SESSION_COOKIE)?.value;
  if (keep) {
    await sql`DELETE FROM sessions WHERE user_id = ${userId} AND token <> ${keep}`;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await sql`
    SELECT u.id, u.username, u.display_name, u.invite_code
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > now() AND u.deleted_at IS NULL`;
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: Number(r.id),
    username: r.username,
    displayName: r.display_name,
    inviteCode: r.invite_code,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError();
  return user;
}

export class AuthError extends Error {
  constructor() {
    super("Not authenticated");
  }
}
