import { assert, assertNoSecretText, baseUrl, cleanupQaUsers, jsonArray, jsonNumber, jsonObject, jsonString, login, request, signup, sql } from "./qa-support";

const password = "core-flow-password";
const recoveredPassword = "core-flow-recovered-password";
const suffix = `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 5)}`;
const today = new Date().toISOString().slice(0, 10);

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  await cleanupQaUsers(suffix, "core");
  const usernameIndex = await sql`
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'users_lower_username_idx'
      AND indexdef ILIKE '%UNIQUE INDEX%'
      AND indexdef ILIKE '%lower(username)%'`;
  assert(usernameIndex.length === 1, "case-insensitive username unique index missing");

  const alice = await signup("alice", suffix, password, "core");
  assert(alice.inviteCode.length >= 32, "new personal invite code should be at least 128 bits");
  const duplicateSignup = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: alice.username,
      password,
      displayName: `Core duplicate ${suffix}`,
    }),
  });
  assert(duplicateSignup.status === 400, `duplicate signup returned ${duplicateSignup.status}`);
  const bob = await signup("bob", suffix, password, "core");
  const charlie = await signup("charlie", suffix, password, "core");
  const dave = await signup("dave", suffix, password, "core");
  const outsider = await signup("outsider", suffix, password, "core");
  const driftLow = await signup("driftlow", suffix, password, "core");
  const driftHigh = await signup("drifthigh", suffix, password, "core");
  const driftOther = await signup("driftother", suffix, password, "core");

  await sql`UPDATE users SET display_name = ${`Core drift same ${suffix}`} WHERE id = ANY(${[driftLow.id, driftHigh.id]})`;
  await sql`UPDATE users SET display_name = ${`Core drift other ${suffix}`} WHERE id = ${driftOther.id}`;
  const driftGroupRows = await sql`
    INSERT INTO groups (name, currency, invite_code, created_by)
    VALUES (${`Core Flow Drift ${suffix}`}, 'USD', ${`core_drift_${suffix}`}, ${driftLow.id})
    RETURNING id`;
  const driftGroupId = Number(driftGroupRows[0].id);
  await sql`
    INSERT INTO group_members (group_id, user_id)
    VALUES (${driftGroupId}, ${driftLow.id}), (${driftGroupId}, ${driftHigh.id}), (${driftGroupId}, ${driftOther.id})`;
  await sql`
    INSERT INTO settlements (group_id, payer_id, recipient_id, amount_cents, currency, converted_cents, settled_date, created_by)
    VALUES (${driftGroupId}, ${driftHigh.id}, ${driftLow.id}, 50, 'USD', 50, ${today}, ${driftLow.id})`;
  const driftExpenseRows = await sql`
    INSERT INTO expenses (group_id, title, amount_cents, currency, converted_cents, fx_rate,
      expense_date, payer_id, category_id, notes, split_method, created_by)
    VALUES (${driftGroupId}, 'drift fixture', 3, 'USD', 1, 1, ${today}, ${driftOther.id}, null, '', 'equal', ${driftOther.id})
    RETURNING id`;
  const driftExpenseId = Number(driftExpenseRows[0].id);
  await sql`
    INSERT INTO expense_shares (expense_id, user_id, share_cents)
    VALUES (${driftExpenseId}, ${driftLow.id}, 1), (${driftExpenseId}, ${driftHigh.id}, 1), (${driftExpenseId}, ${driftOther.id}, 1)`;
  const driftProjection = new Map(
    (await sql`SELECT user_id, net_cents FROM group_balance_rows(${driftGroupId})`).map((r) => [
      Number(r.user_id),
      Number(r.net_cents),
    ])
  );
  assert(driftProjection.get(driftLow.id) === -51, "drift fixture should assign tied drift to the lower duplicate-name user id");
  assert(driftProjection.get(driftHigh.id) === 50, "drift fixture should preserve the higher duplicate-name user balance");
  assert(driftProjection.get(driftOther.id) === 1, "drift fixture should preserve the non-tied residual balance");

  const created = await request("/api/groups", {
    cookie: alice.cookie,
    body: { name: `Core Flow ${suffix}`, currency: "USD" },
  });
  assert(created.res.status === 200, `create group returned ${created.res.status}`);
  const groupId = Number(created.json.id);
  const groupInvite = String(created.json.inviteCode);
  assert(groupInvite.length >= 32, "new group invite code should be at least 128 bits");

  const fakeInviteCode = `core_invite_${suffix}`;
  for (let i = 0; i < 8; i++) {
    const missingInvite = await request("/api/groups/join", { cookie: outsider.cookie, body: { code: fakeInviteCode } });
    assert(missingInvite.res.status === 400, `invalid invite attempt ${i} returned ${missingInvite.res.status}`);
  }
  const throttledInvite = await request("/api/groups/join", { cookie: outsider.cookie, body: { code: fakeInviteCode } });
  assert(
    throttledInvite.res.status === 400 && /too many attempts/i.test(throttledInvite.text),
    "invite throttling did not trigger"
  );
  await sql`DELETE FROM auth_rate_limits WHERE scope = 'invite:account' AND key = lower(${fakeInviteCode})`;
  await sql`DELETE FROM auth_rate_limits WHERE scope = 'invite:ip' AND key = 'unknown'`;

  const customCategory = await request("/api/categories", { cookie: alice.cookie, body: { name: `Core Category ${suffix}` } });
  assert(customCategory.res.status === 200, `create category returned ${customCategory.res.status}`);
  const duplicateCategory = await request("/api/categories", { cookie: alice.cookie, body: { name: `core category ${suffix}` } });
  assert(duplicateCategory.res.status === 400, `duplicate category returned ${duplicateCategory.res.status}`);

  const join = await request("/api/groups/join", { cookie: bob.cookie, body: { code: groupInvite } });
  assert(join.res.status === 200, `join group returned ${join.res.status}`);
  const daveJoin = await request("/api/groups/join", { cookie: dave.cookie, body: { code: groupInvite } });
  assert(daveJoin.res.status === 200, `Dave join group returned ${daveJoin.res.status}`);
  const removeDave = await request(`/api/groups/${groupId}/members/${dave.id}`, { cookie: alice.cookie, method: "DELETE" });
  assert(removeDave.res.status === 200, `remove settled member returned ${removeDave.res.status}`);

  const bobGroups = await request("/api/groups", { cookie: bob.cookie });
  assert(jsonArray(bobGroups.json.groups, "groups").some((g) => jsonNumber(jsonObject(g, "group").id, "group.id") === groupId), "joined group missing for Bob");
  assertNoSecretText(bobGroups.json, "groups response");

  const deleteFixture = await request("/api/groups", {
    cookie: alice.cookie,
    body: { name: `Core Delete Fixture ${suffix}`, currency: "USD" },
  });
  assert(deleteFixture.res.status === 200, `create delete fixture returned ${deleteFixture.res.status}`);
  const deleteGroupId = Number(deleteFixture.json.id);
  const deleteJoin = await request("/api/groups/join", { cookie: bob.cookie, body: { code: String(deleteFixture.json.inviteCode) } });
  assert(deleteJoin.res.status === 200, `join delete fixture returned ${deleteJoin.res.status}`);
  const deleteFixtureExpense = await request(`/api/groups/${deleteGroupId}/expenses`, {
    cookie: alice.cookie,
    body: {
      title: `Delete fixture ${suffix}`,
      amountCents: 10000,
      currency: "USD",
      date: today,
      payerId: alice.id,
      categoryId: null,
      notes: "",
      splitMethod: "equal",
      participants: [{ userId: alice.id }, { userId: bob.id }],
    },
  });
  assert(deleteFixtureExpense.res.status === 200, `delete fixture expense returned ${deleteFixtureExpense.res.status}`);
  const deleteUnsettledGroup = await request(`/api/groups/${deleteGroupId}`, { cookie: alice.cookie, method: "DELETE" });
  assert(deleteUnsettledGroup.res.status === 400, `delete unsettled group returned ${deleteUnsettledGroup.res.status}`);
  const settleDeleteFixture = await request(`/api/groups/${deleteGroupId}/settlements`, {
    cookie: alice.cookie,
    body: { payerId: bob.id, recipientId: alice.id, amountCents: 5000, currency: "USD", date: today, note: "settle before delete" },
  });
  assert(settleDeleteFixture.res.status === 200, `settle delete fixture returned ${settleDeleteFixture.res.status}`);
  const deleteSettledGroup = await request(`/api/groups/${deleteGroupId}`, { cookie: alice.cookie, method: "DELETE" });
  assert(deleteSettledGroup.res.status === 200, `delete settled group returned ${deleteSettledGroup.res.status}`);

  const friendReq = await request("/api/friends", { cookie: charlie.cookie, body: { code: alice.inviteCode } });
  assert(friendReq.res.status === 200, `friend request returned ${friendReq.res.status}`);
  const aliceFriends = await request("/api/friends", { cookie: alice.cookie });
  const incoming = jsonArray(aliceFriends.json.incomingRequests, "incomingRequests")
    .map((r) => jsonObject(r, "incoming request"))
    .find((r) => jsonNumber(r.userId, "incoming userId") === charlie.id);
  assert(incoming, "incoming friend request not visible");
  const accept = await request("/api/friends/requests", {
    cookie: alice.cookie,
    body: { requestId: Number(incoming.id), action: "accept" },
  });
  assert(accept.res.status === 200, `accept request returned ${accept.res.status}`);

  const expenseBody = {
    title: `=Core dinner ${suffix}`,
    amountCents: 1200,
    currency: "USD",
    date: today,
    payerId: alice.id,
    categoryId: null,
    notes: "\r=Core note formula",
    splitMethod: "equal",
    participants: [{ userId: alice.id }, { userId: bob.id }],
  };
  const expense = await request(`/api/groups/${groupId}/expenses`, { cookie: alice.cookie, body: expenseBody });
  assert(expense.res.status === 200, `create expense returned ${expense.res.status}`);
  const expenseId = Number(expense.json.id);

  const detail = await request(`/api/expenses/${expenseId}`, { cookie: bob.cookie });
  assert(detail.res.status === 200, `expense detail returned ${detail.res.status}`);
  const loadedExpense = jsonObject(detail.json.expense, "expense");
  assert(loadedExpense.title === expenseBody.title, "expense title mismatch");
  const firstExpenseUpdatedAt = jsonString(loadedExpense.updatedAt, "expense updatedAt");

  const patched = await request(`/api/expenses/${expenseId}`, {
    cookie: alice.cookie,
    method: "PATCH",
    body: { ...expenseBody, title: `=Core dinner edited ${suffix}`, amountCents: 1400, expectedUpdatedAt: firstExpenseUpdatedAt },
  });
  assert(patched.res.status === 200, `patch expense returned ${patched.res.status}`);

  const itemizedBody = {
    title: `Core itemized ${suffix}`,
    amountCents: 12000,
    currency: "USD",
    date: today,
    payerId: alice.id,
    categoryId: null,
    notes: "itemized tax and tip",
    splitMethod: "itemized",
    participants: [{ userId: alice.id }, { userId: bob.id }],
    items: [{ name: "Dinner", amountCents: 10000, participantIds: [alice.id, bob.id] }],
    itemizedTaxCents: 1000,
    itemizedTipCents: 1000,
  };
  const itemized = await request(`/api/groups/${groupId}/expenses`, { cookie: alice.cookie, body: itemizedBody });
  assert(itemized.res.status === 200, `create itemized expense returned ${itemized.res.status}`);
  const itemizedId = Number(itemized.json.id);
  const itemizedDetail = await request(`/api/expenses/${itemizedId}`, { cookie: bob.cookie });
  assert(itemizedDetail.res.status === 200, `itemized detail returned ${itemizedDetail.res.status}`);
  const loadedItemized = jsonObject(itemizedDetail.json.expense, "itemized expense");
  assert(jsonNumber(loadedItemized.amountCents, "itemized amountCents") === 12000, "itemized amount mismatch");
  assert(jsonNumber(loadedItemized.itemizedTaxCents, "itemizedTaxCents") === 1000, "itemized tax mismatch");
  assert(jsonNumber(loadedItemized.itemizedTipCents, "itemizedTipCents") === 1000, "itemized tip mismatch");
  const itemizedUpdatedAt = jsonString(loadedItemized.updatedAt, "itemized updatedAt");
  const itemizedPatch = await request(`/api/expenses/${itemizedId}`, {
    cookie: alice.cookie,
    method: "PATCH",
    body: { ...itemizedBody, expectedUpdatedAt: itemizedUpdatedAt },
  });
  assert(itemizedPatch.res.status === 200, `patch itemized expense returned ${itemizedPatch.res.status}`);
  const itemizedAfterPatch = await request(`/api/expenses/${itemizedId}`, { cookie: bob.cookie });
  const preservedItemized = jsonObject(itemizedAfterPatch.json.expense, "patched itemized expense");
  assert(jsonNumber(preservedItemized.amountCents, "patched itemized amountCents") === 12000, "patched itemized amount mismatch");
  assert(jsonNumber(preservedItemized.itemizedTaxCents, "patched itemizedTaxCents") === 1000, "patched itemized tax mismatch");
  assert(jsonNumber(preservedItemized.itemizedTipCents, "patched itemizedTipCents") === 1000, "patched itemized tip mismatch");

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
  await sql`UPDATE recurring_expenses SET cadence = 'monthly', next_date = ${today}, anchor_day = 31 WHERE id = ${recurringId}`;
  const recurringList = await request(`/api/groups/${groupId}/recurring`, { cookie: alice.cookie });
  assert(recurringList.res.status === 200, `recurring list returned ${recurringList.res.status}`);
  const recurringRow = jsonArray(recurringList.json.recurring, "recurring").find((row) => jsonNumber(jsonObject(row, "recurring row").id, "recurring id") === recurringId);
  assert(recurringRow !== undefined, "created recurring rule missing from list");
  const recurringUpdatedAt = jsonString(jsonObject(recurringRow, "recurring row").updatedAt, "recurring updatedAt");
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
      cadence: "monthly",
      nextDate: today,
      active: true,
      expectedUpdatedAt: recurringUpdatedAt,
    },
  });
  assert(editRecurring.res.status === 200, `edit recurring returned ${editRecurring.res.status}`);
  const recurringAnchorRows = await sql`SELECT anchor_day FROM recurring_expenses WHERE id = ${recurringId}`;
  assert(Number(recurringAnchorRows[0]?.anchor_day) === 31, "recurring edit should preserve unchanged monthly anchor");
  const editedRecurringUpdatedAt = jsonString(editRecurring.json.updatedAt, "edited recurring updatedAt");
  const stopRecurring = await request(`/api/recurring/${recurringId}?expectedUpdatedAt=${encodeURIComponent(editedRecurringUpdatedAt)}`, {
    cookie: alice.cookie,
    method: "DELETE",
  });
  assert(stopRecurring.res.status === 200, `stop recurring returned ${stopRecurring.res.status}`);
  const staleRecurringStop = await request(`/api/recurring/${recurringId}?expectedUpdatedAt=${encodeURIComponent(editedRecurringUpdatedAt)}`, {
    cookie: bob.cookie,
    method: "DELETE",
  });
  assert(staleRecurringStop.res.status === 400, `stale recurring stop returned ${staleRecurringStop.res.status}`);
  const staleRecurringEdit = await request(`/api/recurring/${recurringId}`, {
    cookie: bob.cookie,
    method: "PATCH",
    body: {
      title: `Core recurring stale ${suffix}`,
      amountCents: 1001,
      currency: "USD",
      payerId: alice.id,
      categoryId: null,
      participantIds: [alice.id, bob.id],
      notes: "",
      cadence: "monthly",
      nextDate: today,
      active: true,
      expectedUpdatedAt: editedRecurringUpdatedAt,
    },
  });
  assert(staleRecurringEdit.res.status === 400, `stale recurring edit returned ${staleRecurringEdit.res.status}`);

  const groupSettlement = await request(`/api/groups/${groupId}/settlements`, {
    cookie: alice.cookie,
    body: { payerId: bob.id, recipientId: alice.id, amountCents: 300, currency: "USD", date: today, note: "group settlement" },
  });
  assert(groupSettlement.res.status === 200, `group settlement returned ${groupSettlement.res.status}`);
  const settlementId = Number(groupSettlement.json.id);
  const firstSettlementUpdatedAt = jsonString(groupSettlement.json.updatedAt, "group settlement updatedAt");
  const editSettlement = await request(`/api/settlements/${settlementId}`, {
    cookie: bob.cookie,
    method: "PATCH",
    body: {
      amountCents: 301,
      currency: "USD",
      date: today,
      note: "edited group settlement",
      expectedUpdatedAt: firstSettlementUpdatedAt,
    },
  });
  assert(editSettlement.res.status === 200, `edit settlement returned ${editSettlement.res.status}`);
  const staleSettlementEdit = await request(`/api/settlements/${settlementId}`, {
    cookie: bob.cookie,
    method: "PATCH",
    body: {
      amountCents: 302,
      currency: "USD",
      date: today,
      note: "stale group settlement",
      expectedUpdatedAt: firstSettlementUpdatedAt,
    },
  });
  assert(staleSettlementEdit.res.status === 400, `stale settlement edit returned ${staleSettlementEdit.res.status}`);
  const editedSettlementUpdatedAt = jsonString(editSettlement.json.updatedAt, "edited settlement updatedAt");
  const groupAfterLedgerChanges = await request(`/api/groups/${groupId}`, { cookie: alice.cookie });
  assert(groupAfterLedgerChanges.res.status === 200, `group detail after ledger changes returned ${groupAfterLedgerChanges.res.status}`);
  const apiBalances = new Map(
    jsonArray(groupAfterLedgerChanges.json.balances, "group balances").map((b) => {
      const balance = jsonObject(b, "group balance");
      return [jsonNumber(balance.userId, "balance userId"), jsonNumber(balance.netCents, "balance netCents")];
    })
  );
  const projectionBalances = await sql`SELECT user_id, net_cents FROM group_balance_rows(${groupId})`;
  for (const balance of projectionBalances) {
    const userId = Number(balance.user_id);
    assert(apiBalances.get(userId) === Number(balance.net_cents), `balance projection mismatch for ${userId}`);
  }

  const directSettlement = await request("/api/settlements", {
    cookie: alice.cookie,
    body: { friendId: charlie.id, direction: "i-paid", amountCents: 222, currency: "USD", date: today, note: "direct settlement" },
  });
  assert(directSettlement.res.status === 200, `direct settlement returned ${directSettlement.res.status}`);
  const directSettlementUpdatedAt = jsonString(directSettlement.json.updatedAt, "direct settlement updatedAt");
  const deleteDirect = await request(`/api/settlements/${Number(directSettlement.json.id)}?expectedUpdatedAt=${encodeURIComponent(directSettlementUpdatedAt)}`, {
    cookie: charlie.cookie,
    method: "DELETE",
  });
  assert(deleteDirect.res.status === 200, `delete direct settlement returned ${deleteDirect.res.status}`);

  const groupMsg = await request(`/api/groups/${groupId}/messages`, { cookie: alice.cookie, body: { body: `group hello ${suffix}` } });
  assert(groupMsg.res.status === 200, `group message returned ${groupMsg.res.status}`);
  const dm = await request(`/api/dm/${charlie.id}/messages`, { cookie: alice.cookie, body: { body: `dm hello ${suffix}` } });
  assert(dm.res.status === 200, `dm returned ${dm.res.status}`);
  const outsiderReadGroup = await request("/api/read", { cookie: outsider.cookie, body: { scope: `msg:group:${groupId}`, lastId: 1_000_000_000_000 } });
  assert(outsiderReadGroup.res.status === 403, `outsider group read marker returned ${outsiderReadGroup.res.status}`);
  const aliceReadOutsiderDm = await request("/api/read", { cookie: alice.cookie, body: { scope: `msg:dm:${outsider.id}`, lastId: 1_000_000_000_000 } });
  assert(aliceReadOutsiderDm.res.status === 403, `outsider dm read marker returned ${aliceReadOutsiderDm.res.status}`);
  const forgedDmRead = await request("/api/read", { cookie: alice.cookie, body: { scope: `msg:dm:${charlie.id}`, lastId: 1_000_000_000_000 } });
  assert(forgedDmRead.res.status === 200, `forged dm read marker returned ${forgedDmRead.res.status}`);
  const charlieReply = await request(`/api/dm/${alice.id}/messages`, { cookie: charlie.cookie, body: { body: `dm reply ${suffix}` } });
  assert(charlieReply.res.status === 200, `dm reply returned ${charlieReply.res.status}`);
  const aliceConversations = await request("/api/conversations", { cookie: alice.cookie });
  assert(aliceConversations.res.status === 200, `alice conversations returned ${aliceConversations.res.status}`);
  const charlieConversation = jsonArray(aliceConversations.json.conversations, "conversations").find((row) => {
    const conversation = jsonObject(row, "conversation");
    return conversation.kind === "dm" && jsonNumber(conversation.id, "conversation id") === charlie.id;
  });
  assert(charlieConversation !== undefined, "Charlie conversation missing");
  assert(jsonObject(charlieConversation, "Charlie conversation").unread === true, "future read marker should not hide later DM");
  const bobSync = await request("/api/sync", { cookie: bob.cookie });
  assert(jsonNumber(jsonObject(bobSync.json.unread, "unread").messages, "unread.messages") > 0, "Bob should have unread group message");
  await request("/api/read", { cookie: bob.cookie, body: { scope: `msg:group:${groupId}`, lastId: Number(groupMsg.json.id) } });

  const nudge = await request("/api/nudges", { cookie: alice.cookie, body: { toId: bob.id, groupId, note: "please settle" } });
  assert(nudge.res.status === 200, `nudge returned ${nudge.res.status}`);
  const bobSyncAfterNudge = await request("/api/sync", { cookie: bob.cookie });
  assert(jsonNumber(jsonObject(bobSyncAfterNudge.json.unread, "unread").nudges, "unread.nudges") > 0, "Bob should have unread nudge");

  const csv = await fetch(`${baseUrl}/api/groups/${groupId}/export`, { headers: { cookie: alice.cookie } });
  assert(csv.status === 200, `CSV returned ${csv.status}`);
  assert((csv.headers.get("content-type") ?? "").includes("text/csv"), "CSV content-type mismatch");
  const csvText = await csv.text();
  assert(csvText.includes(`'=Core dinner edited ${suffix}`), "CSV should neutralize formula-like expense titles");
  assert(!csvText.includes("\r=Core note formula"), "CSV should normalize carriage returns before export");
  assert(csvText.includes(`"'\n=Core note formula"`), "CSV should neutralize formula-like notes after normalized line breaks");

  const recovery = await request("/api/me/recovery-codes", { cookie: alice.cookie, method: "POST" });
  assert(recovery.res.status === 200, `recovery returned ${recovery.res.status}`);
  const recoveryCodes = jsonArray(recovery.json.codes, "recovery codes");
  assert(recoveryCodes.length === 8, "recovery code count mismatch");
  const recoveryRows = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${alice.id} AND used_at IS NULL`;
  assert(Number(recoveryRows[0].n) === 8, "recovery code regeneration should persist exactly eight unused codes");
  const [parallelRecoveryA, parallelRecoveryB] = await Promise.all([
    request("/api/me/recovery-codes", { cookie: alice.cookie, method: "POST" }),
    request("/api/me/recovery-codes", { cookie: alice.cookie, method: "POST" }),
  ]);
  assert(parallelRecoveryA.res.status === 200, `parallel recovery A returned ${parallelRecoveryA.res.status}`);
  assert(parallelRecoveryB.res.status === 200, `parallel recovery B returned ${parallelRecoveryB.res.status}`);
  const parallelRecoveryRows = await sql`SELECT COUNT(*)::int AS n FROM recovery_codes WHERE user_id = ${alice.id} AND used_at IS NULL`;
  assert(Number(parallelRecoveryRows[0].n) === 8, "parallel recovery regeneration should leave exactly one active code set");
  const finalRecovery = await request("/api/me/recovery-codes", { cookie: alice.cookie, method: "POST" });
  assert(finalRecovery.res.status === 200, `final recovery returned ${finalRecovery.res.status}`);
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

  const deleteGroupSettlement = await request(`/api/settlements/${settlementId}?expectedUpdatedAt=${encodeURIComponent(editedSettlementUpdatedAt)}`, {
    cookie: alice.cookie,
    method: "DELETE",
  });
  assert(deleteGroupSettlement.res.status === 200, `delete group settlement returned ${deleteGroupSettlement.res.status}`);
  const deleteExpenseDetail = await request(`/api/expenses/${expenseId}`, { cookie: alice.cookie });
  const deleteExpenseUpdatedAt = jsonString(jsonObject(deleteExpenseDetail.json.expense, "delete expense").updatedAt, "delete expense updatedAt");
  const deleteExpense = await request(`/api/expenses/${expenseId}?expectedUpdatedAt=${encodeURIComponent(deleteExpenseUpdatedAt)}`, { cookie: alice.cookie, method: "DELETE" });
  assert(deleteExpense.res.status === 200, `delete expense returned ${deleteExpense.res.status}`);

  const latestRecoveryCodes = jsonArray(finalRecovery.json.codes, "final recovery codes");
  const recoveryCode = jsonString(latestRecoveryCodes[0], "recovery code");
  const recovered = await fetch(`${baseUrl}/api/auth/recover`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: alice.username, code: recoveryCode, newPassword: recoveredPassword }),
  });
  assert(recovered.status === 200, `recover returned ${recovered.status}`);
  const oldLogin = await login(alice.username, password);
  assert(oldLogin.res.status === 400, `old password should fail after recovery, got ${oldLogin.res.status}`);
  for (let i = 0; i < 8; i++) {
    const failedLogin = await login(alice.username, `${password}-wrong-${i}`);
    assert(failedLogin.res.status === 400, `failed login ${i} returned ${failedLogin.res.status}`);
  }
  const throttledLogin = await login(alice.username, `${password}-wrong-throttled`);
  assert(throttledLogin.res.status === 400 && /too many attempts/i.test(throttledLogin.text), "login throttling did not trigger");
  await sql`DELETE FROM auth_rate_limits WHERE scope = 'login:account' AND key = lower(${alice.username})`;
  await sql`DELETE FROM auth_rate_limits WHERE scope = 'login:ip' AND key = 'unknown'`;
  const newLogin = await login(alice.username, recoveredPassword);
  assert(newLogin.res.status === 200, `new password login failed: ${newLogin.res.status} ${newLogin.text}`);
  const logout = await request("/api/auth/logout", { cookie: newLogin.cookie, method: "POST" });
  assert(logout.res.status === 200, `logout returned ${logout.res.status}`);

  // --- True pairwise friend balances (not a group-wide simplified plan) ---------
  // A three-person chain where A's GROUP net is zero but A genuinely owes B and is
  // owed by C. The friend/people balance must show the real two-party nets, never
  // hide them (the old simplified-plan logic showed A settled with everyone).
  const triA = await signup("tria", suffix, password, "core");
  const triB = await signup("trib", suffix, password, "core");
  const triC = await signup("tric", suffix, password, "core");
  const triGroup = await request("/api/groups", { cookie: triA.cookie, body: { name: `Core Flow Tri ${suffix}`, currency: "USD" } });
  assert(triGroup.res.status === 200, `tri group create returned ${triGroup.res.status}`);
  const triGroupId = Number(triGroup.json.id);
  const triInvite = String(triGroup.json.inviteCode);
  // Joining by code makes the joiner friends with existing members.
  assert((await request("/api/groups/join", { cookie: triB.cookie, body: { code: triInvite } })).res.status === 200, "triB join failed");
  assert((await request("/api/groups/join", { cookie: triC.cookie, body: { code: triInvite } })).res.status === 200, "triC join failed");
  // B pays $100 split A,B -> A owes B $50.
  assert((await request(`/api/groups/${triGroupId}/expenses`, { cookie: triB.cookie, body: {
    title: `Tri B paid ${suffix}`, amountCents: 10000, currency: "USD", date: today, payerId: triB.id, categoryId: null, notes: "",
    splitMethod: "equal", participants: [{ userId: triA.id }, { userId: triB.id }],
  } })).res.status === 200, "tri expense B failed");
  // A pays $100 split A,C -> C owes A $50. Net: A=0, B=+50, C=-50.
  assert((await request(`/api/groups/${triGroupId}/expenses`, { cookie: triA.cookie, body: {
    title: `Tri A paid ${suffix}`, amountCents: 10000, currency: "USD", date: today, payerId: triA.id, categoryId: null, notes: "",
    splitMethod: "equal", participants: [{ userId: triA.id }, { userId: triC.id }],
  } })).res.status === 200, "tri expense A failed");
  const triANet = Number((await sql`SELECT net_cents FROM group_balance_rows(${triGroupId}) WHERE user_id = ${triA.id}`)[0]?.net_cents);
  assert(triANet === 0, `tri A group net should be zero, got ${triANet}`);
  const triBProfile = jsonObject((await request(`/api/people/${triB.id}`, { cookie: triA.cookie })).json.profile, "tri B profile");
  const triCProfile = jsonObject((await request(`/api/people/${triC.id}`, { cookie: triA.cookie })).json.profile, "tri C profile");
  assert(jsonNumber(jsonObject(triBProfile.netByCurrency, "tri B net").USD, "tri B USD") === -5000, "A should owe B $50 (true pairwise)");
  assert(jsonNumber(jsonObject(triCProfile.netByCurrency, "tri C net").USD, "tri C USD") === 5000, "C should owe A $50 (true pairwise)");

  // --- FX snapshot immutability on settlement note edit (M2) --------------------
  // A cross-currency group settlement's converted_cents must not be re-derived at
  // today's rate when only the note/date is edited.
  const fxSettle = await request(`/api/groups/${triGroupId}/settlements`, { cookie: triA.cookie, body: {
    payerId: triA.id, recipientId: triB.id, amountCents: 5000, currency: "EUR", date: today, note: "fx snapshot original",
  } });
  assert(fxSettle.res.status === 200, `fx settlement returned ${fxSettle.res.status}`);
  const fxSettleId = Number(fxSettle.json.id);
  const convertedBefore = Number((await sql`SELECT converted_cents FROM settlements WHERE id = ${fxSettleId}`)[0]?.converted_cents);
  await sql`INSERT INTO fx_rates (currency, rate_per_usd, fetched_at) VALUES ('EUR', 0.5, now())
    ON CONFLICT (currency) DO UPDATE SET rate_per_usd = 0.5, fetched_at = now()`;
  const noteEdit = await request(`/api/settlements/${fxSettleId}`, { cookie: triA.cookie, method: "PATCH", body: {
    amountCents: 5000, currency: "EUR", date: today, note: "fx snapshot edited note only", expectedUpdatedAt: jsonString(fxSettle.json.updatedAt, "fx updatedAt"),
  } });
  assert(noteEdit.res.status === 200, `fx note edit returned ${noteEdit.res.status}`);
  const convertedAfter = Number((await sql`SELECT converted_cents FROM settlements WHERE id = ${fxSettleId}`)[0]?.converted_cents);
  assert(convertedBefore === convertedAfter, `editing only the note must not re-snapshot FX (was ${convertedBefore}, now ${convertedAfter})`);
  // Restore the shared rate cache so this probe leaves no global FX state behind.
  await sql`DELETE FROM fx_rates WHERE currency = 'EUR'`;

  // --- Itemized item participant must be a declared expense participant (M5) ----
  const craftedItemized = await request(`/api/groups/${triGroupId}/expenses`, { cookie: triA.cookie, body: {
    title: `Tri crafted ${suffix}`, amountCents: 1000, currency: "USD", date: today, payerId: triA.id, categoryId: null, notes: "",
    splitMethod: "itemized", participants: [{ userId: triA.id }],
    items: [{ name: "smuggled", amountCents: 1000, participantIds: [triA.id, triB.id] }],
  } });
  assert(craftedItemized.res.status === 400, `itemized item on a non-participant should be rejected, got ${craftedItemized.res.status}`);

  // --- Due recurring materializes on group load without crashing -----------------
  // Postgres DATE columns arrive as JS Date objects, so naive String(date).slice
  // crashed materializeRecurring (group page 500) whenever a recurring rule was due.
  const recurringDue = await request(`/api/groups/${triGroupId}/recurring`, { cookie: triA.cookie, body: {
    title: `Tri rent ${suffix}`, amountCents: 6000, currency: "USD", payerId: triA.id, categoryId: null,
    participantIds: [triA.id, triB.id], notes: "", cadence: "monthly", startDate: today,
  } });
  assert(recurringDue.res.status === 200, `create due recurring returned ${recurringDue.res.status}`);
  const recurringDueId = Number(recurringDue.json.id);
  // Loading the group triggers lazy materialization of the due rule.
  const groupWithDueRecurring = await request(`/api/groups/${triGroupId}`, { cookie: triA.cookie });
  assert(groupWithDueRecurring.res.status === 200, `group load with a due recurring returned ${groupWithDueRecurring.res.status} (materializeRecurring must not crash)`);
  const materialized = await sql`SELECT count(*)::int AS n FROM expenses WHERE recurring_id = ${recurringDueId}`;
  assert(Number(materialized[0].n) >= 1, "due recurring should have materialized at least one expense on group load");
  const advancedRule = await sql`SELECT next_date > ${today}::date AS advanced FROM recurring_expenses WHERE id = ${recurringDueId}`;
  assert(advancedRule[0]?.advanced === true, "recurring next_date should advance past today after materialization");

  console.log(`core flow QA passed for group ${groupId}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => cleanupQaUsers(suffix, "core"));
