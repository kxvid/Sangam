import { supabase } from "@/src/lib/supabase";
import { StatCard } from "@/components/stat-card";
import { Users, Briefcase, Send, Activity } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [
    { count: buyersCount },
    { count: activeBuyers },
    { count: dealsCount },
    { count: aliveDeals },
    { count: outreachWeek },
    { count: repliesWeek },
    { data: recentRun },
  ] = await Promise.all([
    supabase.from("buyers").select("id", { count: "exact", head: true }),
    supabase.from("buyers").select("id", { count: "exact", head: true }).eq("active_flag", true),
    supabase.from("deals").select("id", { count: "exact", head: true }),
    supabase.from("deals").select("id", { count: "exact", head: true }).eq("status", "new"),
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", weekAgo),
    supabase
      .from("outreach")
      .select("id", { count: "exact", head: true })
      .gte("response_at", weekAgo),
    supabase
      .from("discovery_runs")
      .select("*")
      .order("run_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    buyersCount: buyersCount ?? 0,
    activeBuyers: activeBuyers ?? 0,
    dealsCount: dealsCount ?? 0,
    aliveDeals: aliveDeals ?? 0,
    outreachWeek: outreachWeek ?? 0,
    repliesWeek: repliesWeek ?? 0,
    recentRun: recentRun.data ?? null,
  };
}

export default async function DashboardPage() {
  const s = await getStats();
  const replyRate =
    s.outreachWeek > 0 ? `${Math.round((s.repliesWeek / s.outreachWeek) * 100)}%` : "—";

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-400">Operator view of the buyer network.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/score" className="btn btn-primary">
            Score a deal
          </Link>
          <Link href="/buyers" className="btn btn-ghost">
            Browse buyers
          </Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Buyers in DB"
          value={s.buyersCount.toLocaleString()}
          sub={`${s.activeBuyers.toLocaleString()} active`}
          icon={Users}
        />
        <StatCard
          label="Deals"
          value={s.dealsCount.toLocaleString()}
          sub={`${s.aliveDeals.toLocaleString()} alive`}
          icon={Briefcase}
          tone="emerald"
        />
        <StatCard
          label="Outreach (7d)"
          value={s.outreachWeek.toLocaleString()}
          sub={`${s.repliesWeek.toLocaleString()} replies`}
          icon={Send}
        />
        <StatCard label="Reply rate (7d)" value={replyRate} icon={Activity} tone="amber" />
      </section>

      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-ink-200">Latest discovery run</h2>
            <p className="text-xs text-ink-400 mt-1">
              Nightly buyer hunt populates the database from PropertyRadar + skip-trace.
            </p>
          </div>
          {s.recentRun ? (
            <span className="badge badge-muted">
              {new Date(s.recentRun.run_at).toLocaleString()}
            </span>
          ) : (
            <span className="badge badge-warn">Never run</span>
          )}
        </div>
        {s.recentRun && (
          <dl className="mt-5 grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-ink-400">Source</dt>
              <dd className="mt-1 font-mono">{s.recentRun.source}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Added</dt>
              <dd className="mt-1 font-mono text-emerald-300">{s.recentRun.buyers_added}</dd>
            </div>
            <div>
              <dt className="text-ink-400">Updated</dt>
              <dd className="mt-1 font-mono">{s.recentRun.buyers_updated}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}
