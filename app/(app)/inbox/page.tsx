import Link from "next/link";
import { supabase } from "@/src/lib/supabase";
import type { Buyer, Deal, Outreach } from "@/src/types";
import { MessageSquare, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { data: replies } = await supabase
    .from("outreach")
    .select("*, buyer:buyers(*), deal:deals(*)")
    .not("response_at", "is", null)
    .order("response_at", { ascending: false })
    .limit(50);

  const { data: recent } = await supabase
    .from("outreach")
    .select("*, buyer:buyers(*), deal:deals(*)")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(30);

  const r = (replies ?? []) as (Outreach & { buyer: Buyer; deal: Deal })[];
  const s = (recent ?? []) as (Outreach & { buyer: Buyer; deal: Deal })[];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Inbox</h1>
        <p className="mt-1 text-sm text-ink-400">
          Replies from buyers who responded to outreach. Hand-deliver the deal sheet from here.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-200">Replies ({r.length})</h2>
        {r.length === 0 ? (
          <div className="card p-10 text-center text-ink-400 text-sm">No replies yet.</div>
        ) : (
          <div className="space-y-2">
            {r.map((row) => (
              <div key={row.id} className="card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="text-ink-100 font-medium">
                      {row.buyer?.entity_name ?? row.buyer?.full_name ?? "—"}
                    </div>
                    <div className="text-xs text-ink-400 mt-0.5">
                      replied via {row.channel} ·{" "}
                      {row.response_at && new Date(row.response_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="badge badge-alive">replied</span>
                    {row.deal && (
                      <Link
                        href={`/deals/${row.deal.id}`}
                        className="text-emerald-400 hover:text-emerald-300 text-xs"
                      >
                        {row.deal.address} →
                      </Link>
                    )}
                  </div>
                </div>
                <div className="mt-3 text-xs text-ink-400">
                  Contact:{" "}
                  <span className="font-mono text-ink-300">
                    {row.buyer?.phone ?? row.buyer?.email ?? "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink-200">Recent sends</h2>
        {s.length === 0 ? (
          <div className="card p-10 text-center text-ink-400 text-sm">Nothing sent yet.</div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-900/60 text-ink-400 text-xs uppercase tracking-widest">
                <tr>
                  <th className="text-left px-5 py-3">Buyer</th>
                  <th className="text-left px-5 py-3">Deal</th>
                  <th className="text-left px-5 py-3">Channel</th>
                  <th className="text-left px-5 py-3">Sent</th>
                  <th className="text-left px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {s.map((row) => (
                  <tr key={row.id} className="table-row">
                    <td className="px-5 py-3 text-ink-100">
                      {row.buyer?.entity_name ?? row.buyer?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-300 text-xs">
                      {row.deal ? (
                        <Link
                          href={`/deals/${row.deal.id}`}
                          className="hover:text-emerald-300"
                        >
                          {row.deal.address}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-300">
                      <span className="inline-flex items-center gap-1">
                        {row.channel === "sms" ? (
                          <MessageSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        {row.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-400 text-xs">
                      {row.sent_at && new Date(row.sent_at).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      {row.response_at ? (
                        <span className="badge badge-alive">replied</span>
                      ) : (
                        <span className="badge badge-muted">waiting</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
