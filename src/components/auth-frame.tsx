"use client";

import { Wallet } from "lucide-react";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="font-display text-2xl font-bold tracking-tight">SplitWisest</span>
        </div>
        <div className="rounded-2xl border border-line bg-card p-6 shadow-card sm:p-8">{children}</div>
      </div>
    </div>
  );
}
