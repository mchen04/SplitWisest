"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, MessageSquare } from "lucide-react";
import { api, ApiClientError, useSync } from "@/lib/client";
import { AppShell, PageTitle } from "@/components/shell";
import { Card, CardHeader, EmptyState, Avatar, Button } from "@/components/ui";

interface Group { id: number; name: string; memberCount: number; unreadMessages?: number }
interface Friend { id: number; displayName: string; username: string; unreadMessages?: number }

export default function ChatListPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    Promise.all([
      api<{ groups: Group[] }>("/api/groups"),
      api<{ friends: Friend[] }>("/api/friends"),
    ])
      .then(([groupRows, friendRows]) => {
        setGroups(groupRows.groups);
        setFriends(friendRows.friends);
      })
      .catch((err) => {
        setError(err instanceof ApiClientError ? err.message : "Could not load conversations");
      });
  }

  useEffect(() => {
    // Initial conversation list load.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);
  useSync(load);

  const empty = groups?.length === 0 && friends?.length === 0;

  return (
    <AppShell>
      <PageTitle title="Chat" subtitle="Group conversations and direct messages." />
      {error && groups === null && friends === null ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="Could not load conversations"
            hint={error}
            action={<Button variant="secondary" onClick={load}>Retry</Button>}
          />
        </Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={<MessageSquare className="h-8 w-8" />}
            title="No conversations yet"
            hint="Join a group or add a friend to start chatting."
          />
        </Card>
      ) : (
        <div className="space-y-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:pb-2">
          <Card>
            <CardHeader title="Groups" />
            {groups === null ? (
              <div className="space-y-3 p-4">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
            ) : groups.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-faint">No groups yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {groups.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}?tab=chat`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-paper">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent-dark">
                        <Users className="h-4.5 w-4.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{g.name}</span>
                        <span className="block text-xs text-ink-faint">{g.memberCount} {g.memberCount === 1 ? "member" : "members"}</span>
                      </span>
                      {!!g.unreadMessages && <UnreadDot label={`Unread messages in ${g.name}`} />}
                      <MessageSquare className="h-4 w-4 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Direct messages" />
            {friends === null ? (
              <div className="space-y-3 p-4">{[...Array(2)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
            ) : friends.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink-faint">No friends yet. Add one from Balances.</p>
            ) : (
              <ul className="divide-y divide-line">
                {friends.map((f) => (
                  <li key={f.id}>
                    <Link href={`/chat/${f.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-paper">
                      <Avatar name={f.displayName} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{f.displayName}</span>
                        <span className="block text-xs text-ink-faint">@{f.username}</span>
                      </span>
                      {!!f.unreadMessages && <UnreadDot label={`Unread messages from ${f.displayName}`} />}
                      <MessageSquare className="h-4 w-4 text-ink-faint" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AppShell>
  );
}

function UnreadDot({ label }: { label: string }) {
  return (
    <span
      aria-label={label}
      title={label}
      className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
    />
  );
}
