"use client";

import { Wallet } from "lucide-react";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="paper-grain flex min-h-dvh items-center justify-center p-5">
      <div className="rise-in w-full max-w-[404px]">
        <div className="mb-[22px] flex items-center justify-center gap-[11px]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-[23px] text-on-accent">
            <Wallet className="h-[1.15em] w-[1.15em]" />
          </span>
          <span className="font-display text-[25px] font-bold tracking-tight">SplitWisest</span>
        </div>
        <div className="rounded-[18px] border border-line bg-card p-[26px] shadow-card">{children}</div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Not a payment app — settlements are records of payments made offline.
        </p>
      </div>
    </div>
  );
}
