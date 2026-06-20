// Seeds a realistic demo account with friends, multiple groups (incl. a
// multi-currency trip), varied split methods, settlements, a recurring expense,
// and chat, for manual / agent-browser UX review. Prints the login credentials.
// Usage: SPLITWISEST_BASE_URL=http://localhost:3000 npx tsx scripts/seed-ux-demo.ts [suffix]
import "../src/lib/neon-local";
import { baseUrl, request, assert, jsonObject } from "./qa-support";

const suffix = process.argv[2] ?? String(Math.floor(Math.random() * 100000));
const password = "ux-demo-password";
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

interface DemoUser { id: number; username: string; displayName: string; inviteCode: string; cookie: string }

async function createUser(handle: string, displayName: string): Promise<DemoUser> {
  const username = suffix ? `${handle}_${suffix}` : handle;
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });
  assert(res.ok, `signup failed for ${handle}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, `no cookie for ${handle}`);
  const me = await request("/api/me", { cookie });
  const user = jsonObject(me.json.user, "me.user");
  return { id: Number(user.id), username, displayName, inviteCode: String(user.inviteCode), cookie };
}

async function makeFriends(a: DemoUser, b: DemoUser) {
  await request("/api/friends", { cookie: a.cookie, body: { code: b.inviteCode } });
  await request("/api/friends", { cookie: b.cookie, body: { code: a.inviteCode } }); // mutual → auto-accept
}

async function createGroup(owner: DemoUser, name: string, currency: string, members: DemoUser[]) {
  const g = await request("/api/groups", { cookie: owner.cookie, body: { name, currency } });
  assert(g.res.status === 200, `create group ${name} failed: ${g.res.status}`);
  for (const m of members) {
    await request("/api/groups/join", { cookie: m.cookie, body: { code: String(g.json.inviteCode) } });
  }
  return { id: Number(g.json.id), name };
}

async function addExpense(group: { id: number }, payer: DemoUser, body: Record<string, unknown>) {
  const res = await request(`/api/groups/${group.id}/expenses`, { cookie: payer.cookie, body });
  assert(res.res.status === 200, `expense "${body.title}" failed: ${res.res.status} ${res.text}`);
  return Number(res.json.id);
}

async function main() {
  const maya = await createUser("maya_chen", "Maya Chen");
  const diego = await createUser("diego_romero", "Diego Romero");
  const priya = await createUser("priya_patel", "Priya Patel");
  const sam = await createUser("sam_okafor", "Sam Okafor");
  const noah = await createUser("noah_kim", "Noah Kim");
  const all = [maya, diego, priya, sam];

  for (const other of [diego, priya, sam, noah]) await makeFriends(maya, other);
  await makeFriends(diego, priya);
  await makeFriends(priya, noah);

  // 1) Lake Tahoe Trip — everyone, varied split methods.
  const tahoe = await createGroup(maya, "Lake Tahoe Trip", "USD", [diego, priya, sam]);
  const everyone = all.map((u) => ({ userId: u.id }));
  await addExpense(tahoe, maya, {
    title: "Cabin rental", amountCents: 48000, currency: "USD", date: daysAgo(6), payerId: maya.id,
    categoryId: null, notes: "3 nights on the lake", splitMethod: "equal", participants: everyone,
  });
  await addExpense(tahoe, diego, {
    title: "Groceries", amountCents: 8640, currency: "USD", date: daysAgo(5), payerId: diego.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: everyone,
  });
  await addExpense(tahoe, maya, {
    title: "Lift tickets", amountCents: 31200, currency: "USD", date: daysAgo(5), payerId: maya.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: everyone,
  });
  await addExpense(tahoe, priya, {
    title: "Gas", amountCents: 5200, currency: "USD", date: daysAgo(4), payerId: priya.id,
    categoryId: null, notes: "Round trip", splitMethod: "equal",
    participants: [{ userId: maya.id }, { userId: priya.id }],
  });
  await addExpense(tahoe, sam, {
    title: "Dinner at the lodge", amountCents: 18800, currency: "USD", date: daysAgo(4), payerId: sam.id,
    categoryId: null, notes: "Split by what each ordered", splitMethod: "itemized",
    participants: everyone,
    items: [
      { name: "Steak", amountCents: 5200, participantIds: [sam.id] },
      { name: "Pasta", amountCents: 3600, participantIds: [maya.id] },
      { name: "Salmon", amountCents: 4400, participantIds: [diego.id] },
      { name: "Risotto", amountCents: 3200, participantIds: [priya.id] },
    ],
    itemizedTaxCents: 1300, itemizedTipCents: 1100,
  });
  // Diego fronts the flights so Maya owes him on net in USD — gives the demo a
  // realistic "you owe" balance alongside the "owed to you" ones (both directions).
  await addExpense(tahoe, diego, {
    title: "Flights to Tahoe", amountCents: 80000, currency: "USD", date: daysAgo(7), payerId: diego.id,
    categoryId: null, notes: "Booked for Maya + me", splitMethod: "equal",
    participants: [{ userId: maya.id }, { userId: diego.id }],
  });
  await request(`/api/groups/${tahoe.id}/settlements`, {
    cookie: diego.cookie,
    body: { payerId: diego.id, recipientId: maya.id, amountCents: 12000, currency: "USD", date: daysAgo(2), note: "Venmo for the cabin" },
  });

  // 2) Apartment 4B — Maya + Sam, with a recurring rent.
  const apt = await createGroup(maya, "Apartment 4B", "USD", [sam]);
  const pair = [{ userId: maya.id }, { userId: sam.id }];
  await addExpense(apt, maya, {
    title: "Rent — June", amountCents: 240000, currency: "USD", date: daysAgo(20), payerId: maya.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: pair,
  });
  await addExpense(apt, sam, {
    title: "Internet", amountCents: 6000, currency: "USD", date: daysAgo(18), payerId: sam.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: pair,
  });
  await addExpense(apt, maya, {
    title: "Utilities", amountCents: 12850, currency: "USD", date: daysAgo(8), payerId: maya.id,
    categoryId: null, notes: "Power + water", splitMethod: "equal", participants: pair,
  });
  await request(`/api/groups/${apt.id}/recurring`, {
    cookie: maya.cookie,
    body: {
      title: "Rent", amountCents: 240000, currency: "USD", payerId: maya.id, categoryId: null,
      participantIds: [maya.id, sam.id], notes: "", cadence: "monthly", startDate: today,
    },
  });

  // 3) Tokyo 2026 — Maya + Diego, JPY (multi-currency / zero-decimal demo).
  const tokyo = await createGroup(maya, "Tokyo 2026", "JPY", [diego]);
  const mDiego = [{ userId: maya.id }, { userId: diego.id }];
  await addExpense(tokyo, diego, {
    title: "Ramen", amountCents: 360000, currency: "JPY", date: daysAgo(3), payerId: diego.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: mDiego,
  });
  await addExpense(tokyo, maya, {
    title: "Train passes", amountCents: 1200000, currency: "JPY", date: daysAgo(3), payerId: maya.id,
    categoryId: null, notes: "7-day JR pass", splitMethod: "equal", participants: mDiego,
  });

  // 4) Dinner Club — Maya + Diego + Priya + Noah, rotating dinners (fills the
  //    dashboard with more real groups/friends so it isn't sparse).
  const dinner = await createGroup(maya, "Dinner Club", "USD", [diego, priya, noah]);
  const four = [maya, diego, priya, noah].map((u) => ({ userId: u.id }));
  await addExpense(dinner, priya, {
    title: "Tasting menu", amountCents: 32000, currency: "USD", date: daysAgo(9), payerId: priya.id,
    categoryId: null, notes: "Chef's counter", splitMethod: "equal", participants: four,
  });
  await addExpense(dinner, noah, {
    title: "Wine pairing", amountCents: 16800, currency: "USD", date: daysAgo(9), payerId: noah.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: four,
  });
  await addExpense(dinner, maya, {
    title: "Taco night", amountCents: 9600, currency: "USD", date: daysAgo(2), payerId: maya.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: four,
  });

  // 5) Berlin 2026 — Maya + Noah, EUR (a second non-USD trip).
  const berlin = await createGroup(maya, "Berlin 2026", "EUR", [noah]);
  const mNoah = [{ userId: maya.id }, { userId: noah.id }];
  await addExpense(berlin, noah, {
    title: "Airbnb", amountCents: 42000, currency: "EUR", date: daysAgo(11), payerId: noah.id,
    categoryId: null, notes: "4 nights, Kreuzberg", splitMethod: "equal", participants: mNoah,
  });
  await addExpense(berlin, maya, {
    title: "BVG transit passes", amountCents: 7200, currency: "EUR", date: daysAgo(11), payerId: maya.id,
    categoryId: null, notes: "", splitMethod: "equal", participants: mNoah,
  });

  // Chat + DMs (leave a couple unread for the demo user).
  await request(`/api/groups/${tahoe.id}/messages`, { cookie: maya.cookie, body: { body: "Booked the cabin for Friday — can't wait!" } });
  await request(`/api/groups/${tahoe.id}/messages`, { cookie: diego.cookie, body: { body: "I'll grab groceries on the way up." } });
  await request(`/api/groups/${tahoe.id}/messages`, { cookie: priya.cookie, body: { body: "Sending gas money once we're back." } });
  await request(`/api/groups/${apt.id}/messages`, { cookie: sam.cookie, body: { body: "Rent's in — thanks for covering it this month!" } });
  await request(`/api/dm/${maya.id}/messages`, { cookie: diego.cookie, body: { body: "Settled up for the cabin 👍" } });
  await request(`/api/dm/${priya.id}/messages`, { cookie: maya.cookie, body: { body: "No rush on the gas money!" } });

  console.log(JSON.stringify({
    login: { username: maya.username, password },
    friends: [diego.username, priya.username, sam.username],
    groups: [tahoe.name, apt.name, tokyo.name],
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
