"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Layers3 } from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/acquisition", label: "Acquisition", icon: Layers3 },

];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="w-16 md:w-56 shrink-0 border-r border-ink-800 bg-ink-900/40 flex flex-col">
      <div className="px-3 md:px-6 py-5 border-b border-ink-800">
        <Link href="/acquisition" className="flex items-baseline gap-2" aria-label="Sangam acquisition">
          <span className="text-lg font-semibold tracking-tight text-ink-100 hidden md:inline">Sangam</span>
          <span className="md:hidden text-lg font-semibold text-emerald-400">S</span>
          <span className="hidden md:inline text-[10px] uppercase tracking-widest text-ink-400">Kahla</span>
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
              title={it.label}
              aria-label={it.label}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-ink-800 text-ink-100"
                  : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-ink-800 flex items-center gap-3">
        <UserButton />
        <span className="hidden md:inline text-xs text-ink-400">Signed in</span>
      </div>
    </aside>
  );
}
