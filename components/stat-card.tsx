import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon?: LucideIcon;
  tone?: "default" | "emerald" | "red" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "red"
        ? "text-red-300"
        : tone === "amber"
          ? "text-amber-300"
          : "text-ink-100";
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs uppercase tracking-widest text-ink-400">{label}</div>
        {Icon && <Icon className="h-4 w-4 text-ink-500" />}
      </div>
      <div className={`mt-3 font-mono text-3xl tabular-nums ${toneClass}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-400">{sub}</div>}
    </div>
  );
}
