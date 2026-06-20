"use client";

import { Wallet } from "lucide-react";

export function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <div className="rise-in w-full max-w-[404px]">
        <div className="mb-[18px] flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-[11px]">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-[23px] text-on-accent">
              <Wallet className="h-[1.15em] w-[1.15em]" />
            </span>
            <span className="font-wordmark text-[25px] font-semibold tracking-tight">SplitWisest</span>
          </div>
          <p className="text-center text-sm text-ink-soft">
            Track shared expenses with friends — see who owes who, and settle up.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-[26px] shadow-card">{children}</div>
        <p className="mt-4 text-center text-xs text-ink-faint">
          Not a payment app — settlements are records of payments made offline.
        </p>
      </div>
    </div>
  );
}
