// Seeds a demo account with groups, friends, messages, and expenses for
// manual / agent-browser UX review. Prints the login credentials.
// Usage: SPLITWISEST_BASE_URL=http://localhost:3210 npx tsx scripts/seed-ux-demo.ts
import { request, signup } from "./qa-support";

const suffix = process.argv[2] ?? String(Math.floor(Math.random() * 100000));
const password = "ux-demo-password";

async function main() {
  const demo = await signup("demo", suffix, password, "qa");
  const pal = await signup("pal", suffix, password, "qa");
  const roomie = await signup("roomie", suffix, password, "qa");

  // Friendships (request + reciprocal accept).
  for (const other of [pal, roomie]) {
    await request("/api/friends", { cookie: demo.cookie, body: { code: other.inviteCode } });
    await request("/api/friends", { cookie: other.cookie, body: { code: demo.inviteCode } });
  }

  // Two groups with everyone in them.
  const groups: { id: number; name: string }[] = [];
  for (const name of ["Lake Tahoe Trip", "Apartment 4B"]) {
    const g = await request("/api/groups", { cookie: demo.cookie, body: { name, currency: "USD" } });
    const groupId = Number(g.json.id);
    for (const member of [pal, roomie]) {
      await request("/api/groups/join", { cookie: member.cookie, body: { code: g.json.inviteCode } });
    }
    groups.push({ id: groupId, name });
  }

  // Expenses so balances/settle flows have data.
  for (const g of groups) {
    await request(`/api/groups/${g.id}/expenses`, {
      cookie: demo.cookie,
      body: {
        description: g.name === "Apartment 4B" ? "Groceries" : "Cabin rental",
        amountCents: 12450,
        currency: "USD",
        paidBy: demo.id,
        date: "2026-06-10",
        splitMethod: "equal",
        participants: [demo.id, pal.id, roomie.id],
      },
    });
    await request(`/api/groups/${g.id}/expenses`, {
      cookie: pal.cookie,
      body: {
        description: "Gas and snacks",
        amountCents: 6300,
        currency: "USD",
        paidBy: pal.id,
        date: "2026-06-11",
        splitMethod: "equal",
        participants: [demo.id, pal.id],
      },
    });
  }

  // Group chatter + DMs (some unread for the demo user).
  await request(`/api/groups/${groups[0].id}/messages`, { cookie: demo.cookie, body: { body: "Booked the cabin for Friday!" } });
  await request(`/api/groups/${groups[0].id}/messages`, { cookie: pal.cookie, body: { body: "Nice — I'll cover gas on the way up." } });
  await request(`/api/groups/${groups[1].id}/messages`, { cookie: roomie.cookie, body: { body: "Rent is due Tuesday, splitting as usual?" } });
  await request(`/api/dm/${pal.id}/messages`, { cookie: demo.cookie, body: { body: "Hey, did you get my Venmo?" } });
  await request(`/api/dm/${demo.id}/messages`, { cookie: pal.cookie, body: { body: "Yep all settled, thanks!" } });
  await request(`/api/dm/${demo.id}/messages`, { cookie: roomie.cookie, body: { body: "Can you add the utilities bill when you get a sec?" } });

  console.log(JSON.stringify({
    username: demo.username,
    password,
    friends: [pal.username, roomie.username],
    groups,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
