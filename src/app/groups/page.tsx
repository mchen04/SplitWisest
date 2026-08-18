"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, KeyRound } from "lucide-react";
import { api, useApiData, useFormState, CURRENCIES } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, Money, EmptyState, Button, Modal, Field, Input, Select, ErrorNote } from "@/components/ui";

interface Group {
  id: number;
  name: string;
  currency: string;
  inviteCode: string;
  memberCount: number;
  expenseCount: number;
  myNetCents: number;
}

export default function GroupsPage() {
  const router = useRouter();
  const { data } = useApiData<{ groups: Group[] }>("/api/groups");
  const groups = data?.groups ?? null;
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const { error, setError, busy, run } = useFormState();

  const openCreate = () => { setCreateOpen(true); setError(null); setName(""); };
  const openJoin = () => { setJoinOpen(true); setError(null); setCode(""); };

  function create(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api<{ id: number }>("/api/groups", { body: { name, currency } });
      router.push(`/groups/${r.id}`);
    }, "Could not create group");
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api<{ id: number }>("/api/groups/join", { body: { code } });
      router.push(`/groups/${r.id}`);
    }, "Could not join group");
  }

  return (
    <AppShell title="Groups">
      <div className="flex flex-col md:min-h-0 md:flex-1">
        <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {groups === null ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-20 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No groups yet"
              hint="Create one, or join with an invite code."
              action={
                <div className="flex gap-2">
                  <Button onClick={openCreate}>
                    <Plus className="h-4 w-4" /> New group
                  </Button>
                  <Button variant="secondary" onClick={openJoin}>
                    <KeyRound className="h-4 w-4" /> Join
                  </Button>
                </div>
              }
            />
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className={`group-choice group-hue-${g.id % 6} flex min-h-20 items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5 shadow-card transition-colors hover:bg-subtle`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--group-soft)] text-[var(--group-ink)]">
                    <Users className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{g.name}</span>
                    <span className="block text-xs text-ink-faint">
                      {g.memberCount} {g.memberCount === 1 ? "member" : "members"} · {g.expenseCount}{" "}
                      {g.expenseCount === 1 ? "expense" : "expenses"} · {g.currency}
                    </span>
                  </span>
                  <span className="text-right text-sm">
                    {g.myNetCents === 0 ? (
                      <span className="text-ink-faint">settled up</span>
                    ) : (
                      <>
                        <span className="block text-xs text-ink-faint">{g.myNetCents > 0 ? "you're owed" : "you owe"}</span>
                        <Money cents={g.myNetCents} currency={g.currency} signed />
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
            <li>
              <div className="flex min-h-20 items-center gap-2 rounded-xl border border-dashed border-line-strong px-3.5 py-2.5">
                <Button className="flex-1" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> New group
                </Button>
                <Button variant="secondary" className="flex-1" onClick={openJoin}>
                  <KeyRound className="h-4 w-4" /> Join
                </Button>
              </div>
            </li>
          </ul>
        )}
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New group">
        <form onSubmit={create} className="space-y-4">
          <Field label="Group name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Tahoe ski trip" autoFocus />
          </Field>
          <Field label="Group currency" hint="Balances are shown in this currency. Expenses in other currencies convert automatically.">
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" busy={busy}>Create group</Button>
          </div>
        </form>
      </Modal>

      <Modal open={joinOpen} onClose={() => setJoinOpen(false)} title="Join a group">
        <form onSubmit={join} className="space-y-4">
          <Field label="Group invite code" hint="Ask a friend in the group for its invite code.">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
          </Field>
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setJoinOpen(false)}>Cancel</Button>
            <Button type="submit" busy={busy}>Join group</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
