"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Users, KeyRound } from "lucide-react";
import { api, ApiClientError, useSync, CURRENCIES } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
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
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<{ groups: Group[] }>("/api/groups").then((r) => setGroups(r.groups)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useSync(load);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: number }>("/api/groups", { body: { name, currency } });
      router.push(`/groups/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create group");
      setBusy(false);
    }
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ id: number }>("/api/groups/join", { body: { code } });
      router.push(`/groups/${r.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not join group");
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageTitle
        title="Groups"
        subtitle="A group for every shared context — trips, rent, dinners."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { setJoinOpen(true); setError(null); setCode(""); }}>
              <KeyRound className="h-4 w-4" /> Join
            </Button>
            <Button onClick={() => { setCreateOpen(true); setError(null); setName(""); }}>
              <Plus className="h-4 w-4" /> New group
            </Button>
          </div>
        }
      />

      <Card>
        {groups === null ? (
          <div className="space-y-3 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" />}
            title="No groups yet"
            hint="Create your first group, or join one with an invite code."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create a group
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-paper">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-dark">
                    <Users className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{g.name}</span>
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
          </ul>
        )}
      </Card>

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
