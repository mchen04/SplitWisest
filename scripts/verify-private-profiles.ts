import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const baseUrl = process.env.SPLITWISEST_BASE_URL ?? "http://localhost:3000";
const password = "profile-qa-password";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

type Json = Record<string, unknown>;

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

async function signup(role: string) {
  const username = `qa_${role}_${suffix}`;
  const displayName = `QA ${role} ${suffix}`;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });
  assert(res.ok, `signup failed for ${role}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, `signup did not set a cookie for ${role}`);
  const me = await request("/api/me", { cookie });
  assert(me.res.ok, `me failed for ${role}`);
  const user = me.json.user as Json;
  return {
    id: Number(user.id),
    username,
    displayName,
    inviteCode: String(user.inviteCode),
    cookie,
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

  const viewer = await signup("viewer");
  const friend = await signup("friend");
  const shared = await signup("shared");
  const pending = await signup("pending");
  const stranger = await signup("stranger");
  const outsider = await signup("outsider");

  const friendRequest = await request("/api/friends", { cookie: friend.cookie, body: { code: viewer.inviteCode } });
  assert(friendRequest.res.status === 200, `friend request failed: ${friendRequest.res.status}`);
  const viewerFriends = await request("/api/friends", { cookie: viewer.cookie });
  const incomingFriend = (viewerFriends.json.incomingRequests as Json[]).find((r) => Number(r.userId) === friend.id);
  assert(incomingFriend, "friend request not visible to viewer");
  const acceptFriend = await request("/api/friends/requests", {
    cookie: viewer.cookie,
    body: { requestId: Number(incomingFriend.id), action: "accept" },
  });
  assert(acceptFriend.res.status === 200, `accept friend failed: ${acceptFriend.res.status}`);

  const pendingRequest = await request("/api/friends", { cookie: pending.cookie, body: { code: viewer.inviteCode } });
  assert(pendingRequest.res.status === 200, `pending friend request failed: ${pendingRequest.res.status}`);

  const group = await request("/api/groups", {
    cookie: viewer.cookie,
    body: { name: `QA Private Profiles ${suffix}`, currency: "USD" },
  });
  assert(group.res.status === 200, `create group failed: ${group.res.status}`);
  const groupId = Number(group.json.id);
  await sql`
    INSERT INTO group_members (group_id, user_id)
    VALUES (${groupId}, ${friend.id}), (${groupId}, ${shared.id})
    ON CONFLICT DO NOTHING`;

  const expense = await request(`/api/groups/${groupId}/expenses`, {
    cookie: viewer.cookie,
    body: {
      title: `QA Dinner ${suffix}`,
      amountCents: 9000,
      currency: "USD",
      date: new Date().toISOString().slice(0, 10),
      payerId: viewer.id,
      categoryId: null,
      notes: "",
      splitMethod: "equal",
      participants: [{ userId: viewer.id }, { userId: friend.id }, { userId: shared.id }],
    },
  });
  assert(expense.res.status === 200, `create expense failed: ${expense.res.status}`);
  const settlement = await request(`/api/groups/${groupId}/settlements`, {
    cookie: viewer.cookie,
    body: {
      payerId: friend.id,
      recipientId: viewer.id,
      amountCents: 500,
      currency: "EUR",
      date: new Date().toISOString().slice(0, 10),
      note: "profile qa settlement",
    },
  });
  assert(settlement.res.status === 200, `create settlement failed: ${settlement.res.status}`);

  const cases = [
    { id: viewer.id, relationship: "self" },
    { id: friend.id, relationship: "friend" },
    { id: shared.id, relationship: "shared-group" },
    { id: pending.id, relationship: "pending" },
  ];
  for (const c of cases) {
    const { res, json } = await request(`/api/people/${c.id}`, { cookie: viewer.cookie });
    assert(res.status === 200, `${c.relationship} profile returned ${res.status}`);
    assertNoPrivateKeys(json, `${c.relationship} profile`);
    const profile = json.profile as Json;
    assert(profile?.relationship === c.relationship, `expected ${c.relationship}, got ${String(profile?.relationship)}`);
  }

  const friendProfile = (await request(`/api/people/${friend.id}`, { cookie: viewer.cookie })).json.profile as Json;
  assert((friendProfile.sharedGroups as unknown[]).length === 1, "friend profile should include shared group");
  assert((friendProfile.recentExpenses as unknown[]).length === 1, "friend profile should include shared expense");
  assert((friendProfile.recentPayments as unknown[]).length === 1, "friend profile should include shared settlement");
  assert(Number(((friendProfile.recentPayments as Json[])[0]).amountCents) === 500, "settlement history should show original amount");
  assert(((friendProfile.recentPayments as Json[])[0]).currency === "EUR", "settlement history should show original currency");
  assert(friendProfile.canChat === true, "friend profile should allow chat");
  assert(friendProfile.canSettleDirectly === true, "friend profile should allow direct settlement");

  const sharedProfile = (await request(`/api/people/${shared.id}`, { cookie: viewer.cookie })).json.profile as Json;
  assert((sharedProfile.sharedGroups as unknown[]).length === 1, "shared profile should include only shared groups");
  assert(sharedProfile.canChat === false, "shared non-friend profile should not allow direct chat");
  assert(sharedProfile.canRequestFriend === true, "shared non-friend profile should allow friend request");

  const pendingProfile = (await request(`/api/people/${pending.id}`, { cookie: viewer.cookie })).json.profile as Json;
  assert((pendingProfile.sharedGroups as unknown[]).length === 0, "pending profile should not include shared groups");
  assert((pendingProfile.recentExpenses as unknown[]).length === 0, "pending profile should not include expenses");
  assert((pendingProfile.recentPayments as unknown[]).length === 0, "pending profile should not include payments");
  assert(Object.keys(pendingProfile.netByCurrency as Json).length === 0, "pending profile should not include balances");

  const unauth = await request(`/api/people/${friend.id}`);
  assert(unauth.res.status === 401, `unauth profile returned ${unauth.res.status}`);
  assertNoPrivateKeys(unauth.json, "unauth profile error");

  const unconnected = await request(`/api/people/${stranger.id}`, { cookie: viewer.cookie });
  assert(unconnected.res.status === 404, `unconnected profile returned ${unconnected.res.status}`);
  assertNoPrivateKeys(unconnected.json, "unconnected profile error");

  const outsiderView = await request(`/api/people/${viewer.id}`, { cookie: outsider.cookie });
  assert(outsiderView.res.status === 404, `outsider profile returned ${outsiderView.res.status}`);
  assertNoPrivateKeys(outsiderView.json, "outsider profile error");

  const nudge = await request("/api/nudges", {
    cookie: viewer.cookie,
    body: { toId: shared.id, groupId, note: "profile QA nudge" },
  });
  assert(nudge.res.status === 200, `shared-group nudge failed: ${nudge.res.status}`);

  const directSettlement = await request("/api/settlements", {
    cookie: viewer.cookie,
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

  const sharedFriendRequest = await request("/api/friends", {
    cookie: viewer.cookie,
    body: { userId: shared.id },
  });
  assert(sharedFriendRequest.res.status === 200, `shared-group friend request failed: ${sharedFriendRequest.res.status}`);
  assert((sharedFriendRequest.json as Json).status === "requested", "friend request should be pending");

  console.log(`private profile QA passed for group ${groupId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(cleanup);
