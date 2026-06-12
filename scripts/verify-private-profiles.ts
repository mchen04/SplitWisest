import { assert, assertNoSecretText, cleanupQaUsers, jsonArray, jsonNumber, jsonObject, request, signup, sql } from "./qa-support";

const password = "profile-qa-password";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

async function addSharedGroupOnlyMember(groupId: number, userId: number) {
  await sql`
    INSERT INTO group_members (group_id, user_id)
    VALUES (${groupId}, ${userId})
    ON CONFLICT DO NOTHING`;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  await cleanupQaUsers(suffix);

  const viewer = await signup("viewer", suffix, password);
  const friend = await signup("friend", suffix, password);
  const shared = await signup("shared", suffix, password);
  const pending = await signup("pending", suffix, password);
  const stranger = await signup("stranger", suffix, password);
  const outsider = await signup("outsider", suffix, password);

  const friendRequest = await request("/api/friends", { cookie: friend.cookie, body: { code: viewer.inviteCode } });
  assert(friendRequest.res.status === 200, `friend request failed: ${friendRequest.res.status}`);
  const viewerFriends = await request("/api/friends", { cookie: viewer.cookie });
  const incomingFriend = jsonArray(viewerFriends.json.incomingRequests, "incomingRequests")
    .map((r) => jsonObject(r, "incoming request"))
    .find((r) => jsonNumber(r.userId, "incoming userId") === friend.id);
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
  await addSharedGroupOnlyMember(groupId, friend.id);
  await addSharedGroupOnlyMember(groupId, shared.id);

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
    assertNoSecretText(json, `${c.relationship} profile`);
    const profile = jsonObject(json.profile, `${c.relationship} profile`);
    assert(profile?.relationship === c.relationship, `expected ${c.relationship}, got ${String(profile?.relationship)}`);
  }

  const friendProfile = jsonObject((await request(`/api/people/${friend.id}`, { cookie: viewer.cookie })).json.profile, "friend profile");
  assert(jsonArray(friendProfile.sharedGroups, "friend sharedGroups").length === 1, "friend profile should include shared group");
  assert(jsonArray(friendProfile.recentExpenses, "friend recentExpenses").length === 1, "friend profile should include shared expense");
  const friendPayments = jsonArray(friendProfile.recentPayments, "friend recentPayments").map((p) => jsonObject(p, "recent payment"));
  assert(friendPayments.length === 1, "friend profile should include shared settlement");
  assert(jsonNumber(friendPayments[0].amountCents, "payment amount") === 500, "settlement history should show original amount");
  assert(friendPayments[0].currency === "EUR", "settlement history should show original currency");
  assert(friendProfile.canChat === true, "friend profile should allow chat");
  assert(friendProfile.canSettleDirectly === true, "friend profile should allow direct settlement");

  const sharedProfile = jsonObject((await request(`/api/people/${shared.id}`, { cookie: viewer.cookie })).json.profile, "shared profile");
  assert(jsonArray(sharedProfile.sharedGroups, "shared sharedGroups").length === 1, "shared profile should include only shared groups");
  assert(sharedProfile.canChat === false, "shared non-friend profile should not allow direct chat");
  assert(sharedProfile.canRequestFriend === true, "shared non-friend profile should allow friend request");

  const pendingProfile = jsonObject((await request(`/api/people/${pending.id}`, { cookie: viewer.cookie })).json.profile, "pending profile");
  assert(jsonArray(pendingProfile.sharedGroups, "pending sharedGroups").length === 0, "pending profile should not include shared groups");
  assert(jsonArray(pendingProfile.recentExpenses, "pending recentExpenses").length === 0, "pending profile should not include expenses");
  assert(jsonArray(pendingProfile.recentPayments, "pending recentPayments").length === 0, "pending profile should not include payments");
  assert(Object.keys(jsonObject(pendingProfile.netByCurrency, "pending netByCurrency")).length === 0, "pending profile should not include balances");

  const unauth = await request(`/api/people/${friend.id}`);
  assert(unauth.res.status === 401, `unauth profile returned ${unauth.res.status}`);
  assertNoSecretText(unauth.json, "unauth profile error");

  const unconnected = await request(`/api/people/${stranger.id}`, { cookie: viewer.cookie });
  assert(unconnected.res.status === 404, `unconnected profile returned ${unconnected.res.status}`);
  assertNoSecretText(unconnected.json, "unconnected profile error");

  const outsiderView = await request(`/api/people/${viewer.id}`, { cookie: outsider.cookie });
  assert(outsiderView.res.status === 404, `outsider profile returned ${outsiderView.res.status}`);
  assertNoSecretText(outsiderView.json, "outsider profile error");

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
  assert(sharedFriendRequest.json.status === "requested", "friend request should be pending");

  console.log(`private profile QA passed for group ${groupId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => cleanupQaUsers(suffix));
