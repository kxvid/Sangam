import Link from "next/link";
import { supabase } from "@/src/lib/supabase";
import type { Deal } from "@/src/types";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const { data } = await supabase
    .from("deals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const deals = (data ?? []) as Deal[];

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Deals</h1>
          <p className="mt-1 text-sm text-ink-400">{deals.length} most recent.</p>
        </div>
        <Link href="/score" className="btn btn-primary">
          Score a new one
        </Link>
      </header>

      {deals.length === 0 ? (
        <div className="card p-10 text-center text-ink-400 text-sm">
          No deals yet. Click <span className="text-ink-200">Score a new one</span> to start.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-ink-400 text-xs uppercase tracking-widest">
              <tr>
                <th className="text-left px-5 py-3">Address</th>
                <th className="text-right px-5 py-3">Asking</th>
                <th className="text-right px-5 py-3">ARV</th>
                <th className="text-right px-5 py-3">Score</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-left px-5 py-3">Created</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="table-row">
                  <td className="px-5 py-3 text-ink-100">{d.address}</td>
                  <td className="px-5 py-3 text-right font-mono">
                    ${d.asking_price?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-ink-300">
                    ${d.est_arv?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">
                    <span
                      className={
                        (d.deal_score ?? 0) >= 70
                          ? "text-emerald-300"
                          : (d.deal_score ?? 0) >= 30
                            ? "text-amber-300"
                            : "text-red-300"
                      }
                    >
                      {d.deal_score ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`badge ${
                        d.status === "dead"
                          ? "badge-dead"
                          : d.status === "new"
                            ? "badge-alive"
                            : "badge-muted"
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-ink-400">
                    {new Date(d.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/deals/${d.id}`}
                      className="text-emerald-400 hover:text-emerald-300 text-xs"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
