"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { LayoutDashboard, Calculator, Briefcase, Users, Inbox } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/score", label: "Score deal", icon: Calculator },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/buyers", label: "Buyers", icon: Users },
  { href: "/inbox", label: "Inbox", icon: Inbox },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="w-64 shrink-0 border-r border-ink-800 bg-ink-900/40 flex flex-col">
      <div className="px-6 py-5 border-b border-ink-800">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-lg font-semibold tracking-tight text-ink-100">KAHLA</span>
          <span className="text-xs uppercase tracking-widest text-ink-400">Network</span>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + "/");
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-ink-800 text-ink-100"
                  : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100",
              )}
            >
              <Icon className="h-4 w-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-ink-800 flex items-center gap-3">
        <UserButton afterSignOutUrl="/sign-in" />
        <span className="text-xs text-ink-400">Signed in</span>
      </div>
    </aside>
  );
}
