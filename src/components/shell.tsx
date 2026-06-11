"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode } from "react";
import { LayoutDashboard, Users, Scale, Receipt, LogOut, Wallet } from "lucide-react";
import { api, useMe } from "@/lib/client";
import { Avatar } from "./ui";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/balances", label: "Balances", icon: Scale },
  { href: "/expenses", label: "Expenses", icon: Receipt },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const me = useMe();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="paper-grain min-h-dvh">
      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-line bg-card md:flex">
        <Link href="/" className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
            <Wallet className="h-4.5 w-4.5" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight">SplitWisest</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(href)
                  ? "bg-accent-soft text-accent-dark"
                  : "text-ink-soft hover:bg-paper hover:text-ink"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-line p-3">
          {me && (
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Avatar name={me.displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{me.displayName}</p>
                <p className="truncate text-xs text-ink-faint">@{me.username}</p>
              </div>
              <button
                onClick={logout}
                aria-label="Log out"
                title="Log out"
                className="rounded-lg p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-card/95 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <Wallet className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-bold">SplitWisest</span>
        </Link>
        <button
          onClick={logout}
          aria-label="Log out"
          className="rounded-lg p-2 text-ink-faint hover:bg-danger-soft hover:text-danger"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </header>

      <main className="px-4 pb-24 pt-4 sm:px-6 md:ml-56 md:pb-10 md:pt-6 lg:px-10">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
              isActive(href) ? "text-accent-dark" : "text-ink-faint"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
