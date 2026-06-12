import { randomBytes, scryptSync } from "crypto";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const baseUrl = process.env.SPLITWISEST_BASE_URL ?? "http://localhost:3000";
const password = "profile-qa-password";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type Json = Record<string, unknown>;

function hashPassword(raw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(raw, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertNoPrivateKeys(value: unknown, label: string) {
  const text = JSON.stringify(value);
  for (const key of ["inviteCode", "invite_code", "password", "password_hash", "recovery", "sessions"]) {
    assert(!text.includes(key), `${label} leaked private key ${key}`);
  }
}

async function request(path: string, opts: { cookie?: string; method?: string; body?: unknown } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.body ? { "content-type": "application/json" } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { res, json: json as Json };
}

async function login(username: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert(res.ok, `login failed for ${username}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, `login did not set a cookie for ${username}`);
  return cookie;
}

async function createUser(role: string) {
  const rows = await sql`
    INSERT INTO users (username, display_name, password_hash, invite_code)
    VALUES (
      ${`qa_${role}_${suffix}`},
      ${`QA ${role} ${suffix}`},
      ${hashPassword(password)},
      ${randomBytes(4).toString("hex")}
    )
    RETURNING id, username, display_name`;
  return {
    id: Number(rows[0].id),
    username: rows[0].username as string,
    displayName: rows[0].display_name as string,
  };
}

async function cleanup() {
  const users = await sql`SELECT id FROM users WHERE username LIKE ${`qa\\_%\\_${suffix}`} ESCAPE '\\'`;
  const userIds = users.map((u) => Number(u.id));
  if (userIds.length === 0) return;

  const groups = await sql`
    SELECT DISTINCT g.id
    FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id
    WHERE g.created_by = ANY(${userIds}) OR gm.user_id = ANY(${userIds})`;
  const groupIds = groups.map((g) => Number(g.id));

  if (groupIds.length > 0) {
    await sql`DELETE FROM groups WHERE id = ANY(${groupIds})`;
  }
  await sql`DELETE FROM activity WHERE actor_id = ANY(${userIds})`;
  await sql`DELETE FROM messages WHERE sender_id = ANY(${userIds}) OR dm_a = ANY(${userIds}) OR dm_b = ANY(${userIds})`;
  await sql`DELETE FROM settlements WHERE payer_id = ANY(${userIds}) OR recipient_id = ANY(${userIds}) OR created_by = ANY(${userIds})`;
  await sql`DELETE FROM nudges WHERE from_id = ANY(${userIds}) OR to_id = ANY(${userIds})`;
  await sql`DELETE FROM friend_requests WHERE from_id = ANY(${userIds}) OR to_id = ANY(${userIds})`;
  await sql`DELETE FROM friendships WHERE user_a = ANY(${userIds}) OR user_b = ANY(${userIds})`;
  await sql`DELETE FROM users WHERE id = ANY(${userIds})`;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  await cleanup();

  const viewer = await createUser("viewer");
  const friend = await createUser("friend");
  const shared = await createUser("shared");
  const pending = await createUser("pending");
  const stranger = await createUser("stranger");
  const outsider = await createUser("outsider");

  const [friendA, friendB] = viewer.id < friend.id ? [viewer.id, friend.id] : [friend.id, viewer.id];
  await sql`INSERT INTO friendships (user_a, user_b) VALUES (${friendA}, ${friendB})`;
  await sql`INSERT INTO friend_requests (from_id, to_id) VALUES (${pending.id}, ${viewer.id})`;

  const groups = await sql`
    INSERT INTO groups (name, currency, invite_code, created_by)
    VALUES (${`QA Private Profiles ${suffix}`}, 'USD', ${randomBytes(4).toString("hex")}, ${viewer.id})
    RETURNING id`;
  const groupId = Number(groups[0].id);
  await sql`
    INSERT INTO group_members (group_id, user_id)
    VALUES (${groupId}, ${viewer.id}), (${groupId}, ${friend.id}), (${groupId}, ${shared.id})`;
  const expenses = await sql`
    INSERT INTO expenses (
      group_id, title, amount_cents, currency, converted_cents, expense_date,
      payer_id, split_method, created_by
    )
    VALUES (${groupId}, ${`QA Dinner ${suffix}`}, 9000, 'USD', 9000, current_date, ${viewer.id}, 'equal', ${viewer.id})
    RETURNING id`;
  const expenseId = Number(expenses[0].id);
  await sql`
    INSERT INTO expense_shares (expense_id, user_id, share_cents)
    VALUES (${expenseId}, ${viewer.id}, 3000), (${expenseId}, ${friend.id}, 3000), (${expenseId}, ${shared.id}, 3000)`;
  await sql`
    INSERT INTO settlements (
      group_id, payer_id, recipient_id, amount_cents, currency, converted_cents,
      settled_date, note, created_by
    )
    VALUES (${groupId}, ${friend.id}, ${viewer.id}, 500, 'USD', 500, current_date, 'profile qa settlement', ${viewer.id})`;

  const viewerCookie = await login(viewer.username);
  const outsiderCookie = await login(outsider.username);

  const cases = [
    { id: viewer.id, relationship: "self" },
    { id: friend.id, relationship: "friend" },
    { id: shared.id, relationship: "shared-group" },
    { id: pending.id, relationship: "pending" },
  ];
  for (const c of cases) {
    const { res, json } = await request(`/api/people/${c.id}`, { cookie: viewerCookie });
    assert(res.status === 200, `${c.relationship} profile returned ${res.status}`);
    assertNoPrivateKeys(json, `${c.relationship} profile`);
    const profile = json.profile as Json;
    assert(profile?.relationship === c.relationship, `expected ${c.relationship}, got ${String(profile?.relationship)}`);
  }

  const friendProfile = (await request(`/api/people/${friend.id}`, { cookie: viewerCookie })).json.profile as Json;
  assert((friendProfile.sharedGroups as unknown[]).length === 1, "friend profile should include shared group");
  assert((friendProfile.recentExpenses as unknown[]).length === 1, "friend profile should include shared expense");
  assert((friendProfile.recentPayments as unknown[]).length === 1, "friend profile should include shared settlement");
  assert(friendProfile.canChat === true, "friend profile should allow chat");
  assert(friendProfile.canSettleDirectly === true, "friend profile should allow direct settlement");

  const sharedProfile = (await request(`/api/people/${shared.id}`, { cookie: viewerCookie })).json.profile as Json;
  assert((sharedProfile.sharedGroups as unknown[]).length === 1, "shared profile should include only shared groups");
  assert(sharedProfile.canChat === false, "shared non-friend profile should not allow direct chat");
  assert(sharedProfile.canRequestFriend === true, "shared non-friend profile should allow friend request");

  const pendingProfile = (await request(`/api/people/${pending.id}`, { cookie: viewerCookie })).json.profile as Json;
  assert((pendingProfile.sharedGroups as unknown[]).length === 0, "pending profile should not include shared groups");
  assert((pendingProfile.recentExpenses as unknown[]).length === 0, "pending profile should not include expenses");
  assert((pendingProfile.recentPayments as unknown[]).length === 0, "pending profile should not include payments");
  assert(Object.keys(pendingProfile.netByCurrency as Json).length === 0, "pending profile should not include balances");

  const unauth = await request(`/api/people/${friend.id}`);
  assert(unauth.res.status === 401, `unauth profile returned ${unauth.res.status}`);
  assertNoPrivateKeys(unauth.json, "unauth profile error");

  const unconnected = await request(`/api/people/${stranger.id}`, { cookie: viewerCookie });
  assert(unconnected.res.status === 404, `unconnected profile returned ${unconnected.res.status}`);
  assertNoPrivateKeys(unconnected.json, "unconnected profile error");

  const outsiderView = await request(`/api/people/${viewer.id}`, { cookie: outsiderCookie });
  assert(outsiderView.res.status === 404, `outsider profile returned ${outsiderView.res.status}`);
  assertNoPrivateKeys(outsiderView.json, "outsider profile error");

  const nudge = await request("/api/nudges", {
    cookie: viewerCookie,
    body: { toId: shared.id, groupId, note: "profile QA nudge" },
  });
  assert(nudge.res.status === 200, `shared-group nudge failed: ${nudge.res.status}`);

  const directSettlement = await request("/api/settlements", {
    cookie: viewerCookie,
    body: {
      friendId: friend.id,
      direction: "i-paid",
      amountCents: 123,
      currency: "USD",
      date: new Date().toISOString().slice(0, 10),
      note: "profile QA direct settlement",
    },
  });
  assert(directSettlement.res.status === 200, `direct settlement failed: ${directSettlement.res.status}`);

  const friendRequest = await request("/api/friends", {
    cookie: viewerCookie,
    body: { userId: shared.id },
  });
  assert(friendRequest.res.status === 200, `shared-group friend request failed: ${friendRequest.res.status}`);
  assert((friendRequest.json as Json).status === "requested", "friend request should be pending");

  console.log(`private profile QA passed for group ${groupId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(cleanup);
