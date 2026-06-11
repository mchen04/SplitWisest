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
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api<{ friends: { id: number; displayName: string; username: string }[] }>("/api/friends")
      .then((r) => setFriend(r.friends.find((f) => f.id === Number(friendId)) ?? null))
      .catch(() => {});
  }, [friendId]);

  useSync(() => setRefreshKey((k) => k + 1));

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-3">
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
      <Card>
        {me && (
          <ChatPane
            endpoint={`/api/dm/${friendId}/messages`}
            meId={me.id}
            refreshKey={refreshKey}
            emptyHint="No messages yet — start the conversation."
          />
        )}
      </Card>
    </AppShell>
  );
}
