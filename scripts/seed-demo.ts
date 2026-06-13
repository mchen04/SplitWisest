// Seeds a realistic demo account (real-sounding names, mixed owe/owed balances,
// a few categorized expenses, group + DM chatter) for design-review captures.
// Usage: SPLITWISEST_BASE_URL=http://localhost:3210 pnpm tsx scripts/seed-demo.ts
import { baseUrl, request, jsonObject } from "./qa-support";

const suffix = process.argv[2] ?? String(Math.floor(Math.random() * 100000));
const password = "demo-password";

async function signup(username: string, displayName: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, displayName }),
  });
  if (!res.ok) throw new Error(`signup failed for ${username}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  const me = await request("/api/me", { cookie });
  const user = jsonObject(me.json.user, "me.user");
  return { id: Number(user.id), username, displayName, inviteCode: String(user.inviteCode), cookie };
}

async function main() {
  const maya = await signup(`maya_${suffix}`, "Maya Chen");
  const liam = await signup(`liam_${suffix}`, "Liam Walsh");
  const sofia = await signup(`sofia_${suffix}`, "Sofia Reyes");
  const noah = await signup(`noah_${suffix}`, "Noah Bennett");

  // Friendships (request + reciprocal accept).
  for (const other of [liam, sofia, noah]) {
    await request("/api/friends", { cookie: maya.cookie, body: { code: other.inviteCode } });
    await request("/api/friends", { cookie: other.cookie, body: { code: maya.inviteCode } });
  }

  // Categories — grab the first couple defaults to show category chips.
  const catRes = await request("/api/categories", { cookie: maya.cookie });
  const cats = (catRes.json.categories as { id: number; name: string }[]) ?? [];
  const cat = (name: string) => cats.find((c) => c.name.toLowerCase().includes(name))?.id ?? cats[0]?.id ?? null;

  // Groups with overlapping membership.
  const defs = [
    { name: "Tahoe Trip", members: [liam, sofia] },
    { name: "Apartment 4B", members: [liam, noah] },
    { name: "Brunch Club", members: [sofia, noah] },
  ];
  const groups: { id: number; name: string; members: typeof liam[] }[] = [];
  for (const d of defs) {
    const g = await request("/api/groups", { cookie: maya.cookie, body: { name: d.name, currency: "USD" } });
    const id = Number(g.json.id);
    for (const m of d.members) await request("/api/groups/join", { cookie: m.cookie, body: { code: g.json.inviteCode } });
    groups.push({ id, name: d.name, members: d.members });
  }
  const [tahoe, apt, brunch] = groups;

  const addExpense = (
    groupId: number,
    payer: typeof maya,
    title: string,
    amountCents: number,
    members: typeof maya[],
    date: string,
    categoryId: number | null = null,
  ) =>
    request(`/api/groups/${groupId}/expenses`, {
      cookie: payer.cookie,
      body: {
        title, amountCents, currency: "USD", payerId: payer.id, date,
        categoryId, splitMethod: "equal",
        participants: [maya, ...members].map((u) => ({ userId: u.id })),
      },
    });

  // Mixed payers so Maya both owes and is owed.
  await addExpense(tahoe.id, maya, "Cabin rental", 48000, [liam, sofia], "2026-06-06", cat("travel"));
  await addExpense(tahoe.id, sofia, "Groceries", 8640, [liam, sofia], "2026-06-07", cat("food"));
  await addExpense(tahoe.id, liam, "Gas", 5200, [liam, sofia], "2026-06-08");
  await addExpense(apt.id, noah, "Internet", 7999, [liam, noah], "2026-06-03", cat("util"));
  await addExpense(apt.id, maya, "Groceries", 12450, [liam, noah], "2026-06-09", cat("food"));
  await addExpense(brunch.id, sofia, "Brunch at Zazie", 9630, [sofia, noah], "2026-06-10", cat("food"));

  // Chat: group messages + DMs, leaving some unread for Maya.
  await request(`/api/groups/${tahoe.id}/messages`, { cookie: maya.cookie, body: { body: "Booked the cabin for Friday 🎉" } });
  await request(`/api/groups/${tahoe.id}/messages`, { cookie: liam.cookie, body: { body: "Nice — I'll grab gas on the way up." } });
  await request(`/api/groups/${apt.id}/messages`, { cookie: noah.cookie, body: { body: "Internet bill's posted, splitting as usual?" } });
  await request(`/api/dm/${maya.id}/messages`, { cookie: sofia.cookie, body: { body: "Can you settle the brunch when you get a sec?" } });
  await request(`/api/dm/${liam.id}/messages`, { cookie: maya.cookie, body: { body: "Sent you the cabin total!" } });

  console.log(JSON.stringify({ username: maya.username, password, friends: [liam.username, sofia.username, noah.username], groups }, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
