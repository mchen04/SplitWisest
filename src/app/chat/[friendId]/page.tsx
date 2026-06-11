"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { api, useMe, useSync } from "@/lib/client";
import { AppShell } from "@/components/shell";
import { Card, Avatar } from "@/components/ui";
import { ChatPane } from "@/components/chat";

export default function DmPage({ params }: { params: Promise<{ friendId: string }> }) {
  const { friendId } = use(params);
  const me = useMe();
  const [friend, setFriend] = useState<{ id: number; displayName: string; username: string } | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api<{ friends: { id: number; displayName: string; username: string }[] }>("/api/friends")
      .then((r) => {
        const f = r.friends.find((x) => x.id === Number(friendId)) ?? null;
        setFriend(f);
        setNotFound(!f);
      })
      .catch(() => setNotFound(true));
  }, [friendId]);

  useSync(() => setRefreshKey((k) => k + 1));

  if (notFound) {
    return (
      <AppShell>
        <Card>
          <div className="px-6 py-12 text-center">
            <p className="font-medium text-ink-soft">Friend not found</p>
            <p className="mt-1 text-sm text-ink-faint">You can only chat with people on your friends list.</p>
            <Link href="/balances" className="mt-4 inline-block text-sm font-medium text-accent hover:underline">
              Back to balances
            </Link>
          </div>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3 md:shrink-0">
        <Link href="/balances" aria-label="Back to balances" className="rounded-lg p-2 text-ink-soft hover:bg-accent-soft">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        {friend ? (
          <>
            <Avatar name={friend.displayName} />
            <div>
              <h1 className="font-display text-xl font-bold">{friend.displayName}</h1>
              <p className="text-xs text-ink-faint">@{friend.username} · direct chat</p>
            </div>
          </>
        ) : (
          <div className="skeleton h-9 w-44" />
        )}
      </div>
      <Card className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        {me && (
          <ChatPane
            endpoint={`/api/dm/${friendId}/messages`}
            meId={me.id}
            refreshKey={refreshKey}
            emptyHint="No messages yet — start the conversation."
            readScope={`msg:dm:${friendId}`}
          />
        )}
      </Card>
    </AppShell>
  );
}
