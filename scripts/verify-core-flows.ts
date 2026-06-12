import { assert, assertNoSecretText, baseUrl, cleanupQaUsers, login, request, signup } from "./qa-support";

const password = "core-flow-password";
const recoveredPassword = "core-flow-recovered-password";
const suffix = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
const today = new Date().toISOString().slice(0, 10);

type Json = Record<string, unknown>;

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  await cleanupQaUsers(suffix, "core");

  const alice = await signup("alice", suffix, password, "core");
  const bob = await signup("bob", suffix, password, "core");
  const charlie = await signup("charlie", suffix, password, "core");
  const outsider = await signup("outsider", suffix, password, "core");

  const created = await request("/api/groups", {
    cookie: alice.cookie,
    body: { name: `Core Flow ${suffix}`, currency: "USD" },
  });
  assert(created.res.status === 200, `create group returned ${created.res.status}`);
  const groupId = Number(created.json.id);
  const groupInvite = String(created.json.inviteCode);

  const join = await request("/api/groups/join", { cookie: bob.cookie, body: { code: groupInvite } });
  assert(join.res.status === 200, `join group returned ${join.res.status}`);

  const bobGroups = await request("/api/groups", { cookie: bob.cookie });
  assert((bobGroups.json.groups as unknown[]).some((g) => Number((g as Json).id) === groupId), "joined group missing for Bob");
  assertNoSecretText(bobGroups.json, "groups response");

  const friendReq = await request("/api/friends", { cookie: charlie.cookie, body: { code: alice.inviteCode } });
  assert(friendReq.res.status === 200, `friend request returned ${friendReq.res.status}`);
  const aliceFriends = await request("/api/friends", { cookie: alice.cookie });
  const incoming = (aliceFriends.json.incomingRequests as Json[]).find((r) => Number(r.userId) === charlie.id);
  assert(incoming, "incoming friend request not visible");
  const accept = await request("/api/friends/requests", {
    cookie: alice.cookie,
    body: { requestId: Number(incoming.id), action: "accept" },
  });
  assert(accept.res.status === 200, `accept request returned ${accept.res.status}`);

  const expenseBody = {
    title: `Core dinner ${suffix}`,
    amountCents: 1200,
    currency: "USD",
    date: today,
    payerId: alice.id,
    categoryId: null,
    notes: "core flow note",
    splitMethod: "equal",
    participants: [{ userId: alice.id }, { userId: bob.id }],
  };
  const expense = await request(`/api/groups/${groupId}/expenses`, { cookie: alice.cookie, body: expenseBody });
  assert(expense.res.status === 200, `create expense returned ${expense.res.status}`);
  const expenseId = Number(expense.json.id);

  const detail = await request(`/api/expenses/${expenseId}`, { cookie: bob.cookie });
  assert(detail.res.status === 200, `expense detail returned ${detail.res.status}`);
  assert((detail.json.expense as Json).title === expenseBody.title, "expense title mismatch");

  const patched = await request(`/api/expenses/${expenseId}`, {
    cookie: alice.cookie,
    method: "PATCH",
    body: { ...expenseBody, title: `Core dinner edited ${suffix}`, amountCents: 1400 },
  });
  assert(patched.res.status === 200, `patch expense returned ${patched.res.status}`);

  const comment = await request(`/api/expenses/${expenseId}/comments`, {
    cookie: bob.cookie,
    body: { body: `Looks good ${suffix}` },
  });
  assert(comment.res.status === 200, `comment returned ${comment.res.status}`);

  const badAttachmentForm = new FormData();
  badAttachmentForm.append("file", new Blob(["bad"], { type: "text/plain" }), "bad.txt");
  const badAttachment = await request(`/api/expenses/${expenseId}/attachments`, {
    cookie: alice.cookie,
    form: badAttachmentForm,
  });
  assert(badAttachment.res.status === 400, `invalid attachment returned ${badAttachment.res.status}`);

  const attachmentForm = new FormData();
  attachmentForm.append("file", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "receipt.png");
  const attachment = await request(`/api/expenses/${expenseId}/attachments`, { cookie: alice.cookie, form: attachmentForm });
  assert(attachment.res.status === 200, `valid attachment returned ${attachment.res.status}`);
  const attachmentId = Number(attachment.json.id);
  const outsiderAttachment = await request(`/api/attachments/${attachmentId}`, { cookie: outsider.cookie });
  assert(outsiderAttachment.res.status === 403, `outsider attachment returned ${outsiderAttachment.res.status}`);
  const deleteAttachment = await request(`/api/attachments/${attachmentId}`, { cookie: bob.cookie, method: "DELETE" });
  assert(deleteAttachment.res.status === 200, `delete attachment returned ${deleteAttachment.res.status}`);

  const recurring = await request(`/api/groups/${groupId}/recurring`, {
    cookie: alice.cookie,
    body: {
      title: `Core recurring ${suffix}`,
      amountCents: 900,
      currency: "USD",
      payerId: alice.id,
      categoryId: null,
      participantIds: [alice.id, bob.id],
      notes: "",
      cadence: "monthly",
      startDate: today,
    },
  });
  assert(recurring.res.status === 200, `create recurring returned ${recurring.res.status}`);
  const recurringId = Number(recurring.json.id);
  const editRecurring = await request(`/api/recurring/${recurringId}`, {
    cookie: bob.cookie,
    method: "PATCH",
    body: {
      title: `Core recurring edited ${suffix}`,
      amountCents: 1000,
      currency: "USD",
      payerId: alice.id,
      categoryId: null,
      participantIds: [alice.id, bob.id],
      notes: "",
      cadence: "weekly",
      nextDate: today,
      active: true,
    },
  });
  assert(editRecurring.res.status === 200, `edit recurring returned ${editRecurring.res.status}`);
  const stopRecurring = await request(`/api/recurring/${recurringId}`, { cookie: alice.cookie, method: "DELETE" });
  assert(stopRecurring.res.status === 200, `stop recurring returned ${stopRecurring.res.status}`);

  const groupSettlement = await request(`/api/groups/${groupId}/settlements`, {
    cookie: alice.cookie,
    body: { payerId: bob.id, recipientId: alice.id, amountCents: 300, currency: "USD", date: today, note: "group settlement" },
  });
  assert(groupSettlement.res.status === 200, `group settlement returned ${groupSettlement.res.status}`);
  const settlementId = Number(groupSettlement.json.id);
  const editSettlement = await request(`/api/settlements/${settlementId}`, {
    cookie: bob.cookie,
    method: "PATCH",
    body: { amountCents: 301, currency: "USD", date: today, note: "edited group settlement" },
  });
  assert(editSettlement.res.status === 200, `edit settlement returned ${editSettlement.res.status}`);

  const directSettlement = await request("/api/settlements", {
    cookie: alice.cookie,
    body: { friendId: charlie.id, direction: "i-paid", amountCents: 222, currency: "USD", date: today, note: "direct settlement" },
  });
  assert(directSettlement.res.status === 200, `direct settlement returned ${directSettlement.res.status}`);
  const deleteDirect = await request(`/api/settlements/${Number(directSettlement.json.id)}`, {
    cookie: charlie.cookie,
    method: "DELETE",
  });
  assert(deleteDirect.res.status === 200, `delete direct settlement returned ${deleteDirect.res.status}`);

  const groupMsg = await request(`/api/groups/${groupId}/messages`, { cookie: alice.cookie, body: { body: `group hello ${suffix}` } });
  assert(groupMsg.res.status === 200, `group message returned ${groupMsg.res.status}`);
  const dm = await request(`/api/dm/${charlie.id}/messages`, { cookie: alice.cookie, body: { body: `dm hello ${suffix}` } });
  assert(dm.res.status === 200, `dm returned ${dm.res.status}`);
  const bobSync = await request("/api/sync", { cookie: bob.cookie });
  assert(Number(((bobSync.json.unread as Json).messages)) > 0, "Bob should have unread group message");
  await request("/api/read", { cookie: bob.cookie, body: { scope: `msg:group:${groupId}`, lastId: Number(groupMsg.json.id) } });

  const nudge = await request("/api/nudges", { cookie: alice.cookie, body: { toId: bob.id, groupId, note: "please settle" } });
  assert(nudge.res.status === 200, `nudge returned ${nudge.res.status}`);
  const bobSyncAfterNudge = await request("/api/sync", { cookie: bob.cookie });
  assert(Number((bobSyncAfterNudge.json.unread as Json).nudges) > 0, "Bob should have unread nudge");

  const csv = await fetch(`${baseUrl}/api/groups/${groupId}/export`, { headers: { cookie: alice.cookie } });
  assert(csv.status === 200, `CSV returned ${csv.status}`);
  assert((csv.headers.get("content-type") ?? "").includes("text/csv"), "CSV content-type mismatch");

  const recovery = await request("/api/me/recovery-codes", { cookie: alice.cookie, method: "POST" });
  assert(recovery.res.status === 200, `recovery returned ${recovery.res.status}`);
  assert((recovery.json.codes as unknown[]).length === 8, "recovery code count mismatch");
  const settings = await request("/api/me", {
    cookie: alice.cookie,
    method: "PATCH",
    body: { displayName: `${alice.displayName} Edited`, username: alice.username },
  });
  assert(settings.res.status === 200, `settings returned ${settings.res.status}`);

  const outsiderGroup = await request(`/api/groups/${groupId}`, { cookie: outsider.cookie });
  assert(outsiderGroup.res.status === 403, `outsider group returned ${outsiderGroup.res.status}`);
  const outsiderExpense = await request(`/api/expenses/${expenseId}`, { cookie: outsider.cookie });
  assert(outsiderExpense.res.status === 403, `outsider expense returned ${outsiderExpense.res.status}`);
  const unauthGroup = await request(`/api/groups/${groupId}`);
  assert(unauthGroup.res.status === 401, `unauth group returned ${unauthGroup.res.status}`);
  assertNoSecretText(outsiderGroup.json, "outsider group error");
  assertNoSecretText(outsiderExpense.json, "outsider expense error");
  assertNoSecretText(unauthGroup.json, "unauth group error");

  const deleteGroupSettlement = await request(`/api/settlements/${settlementId}`, { cookie: alice.cookie, method: "DELETE" });
  assert(deleteGroupSettlement.res.status === 200, `delete group settlement returned ${deleteGroupSettlement.res.status}`);
  const deleteExpense = await request(`/api/expenses/${expenseId}`, { cookie: alice.cookie, method: "DELETE" });
  assert(deleteExpense.res.status === 200, `delete expense returned ${deleteExpense.res.status}`);

  const recoveryCode = String((recovery.json.codes as string[])[0]);
  const recovered = await fetch(`${baseUrl}/api/auth/recover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: alice.username, code: recoveryCode, newPassword: recoveredPassword }),
  });
  assert(recovered.status === 200, `recover returned ${recovered.status}`);
  const oldLogin = await login(alice.username, password);
  assert(oldLogin.res.status === 400, `old password should fail after recovery, got ${oldLogin.res.status}`);
  const newLogin = await login(alice.username, recoveredPassword);
  assert(newLogin.res.status === 200, `new password login failed: ${newLogin.res.status} ${newLogin.text}`);
  const logout = await request("/api/auth/logout", { cookie: newLogin.cookie, method: "POST" });
  assert(logout.res.status === 200, `logout returned ${logout.res.status}`);

  console.log(`core flow QA passed for group ${groupId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => cleanupQaUsers(suffix, "core"));
