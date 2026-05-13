import Link from "next/link";
import { notFound } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import { DealActions } from "@/components/deal-actions";
import type { Buyer, Deal, Outreach } from "@/src/types";
import { ArrowLeft, MessageSquare, Mail } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: deal } = await supabase.from("deals").select("*").eq("id", id).maybeSingle();
  if (!deal) notFound();
  const d = deal as Deal;

  const { data: outreachRows } = await supabase
    .from("outreach")
    .select("*, buyer:buyers(*)")
    .eq("deal_id", id);

  const rows = (outreachRows ?? []) as (Outreach & { buyer: Buyer })[];
  const pending = rows.filter((r) => !r.sent_at);
  const sent = rows.filter((r) => r.sent_at && !r.message_text?.startsWith("[DRY RUN]"));
  const drafts = rows.filter((r) => r.message_text?.startsWith("[DRY RUN]"));

  const alive = d.status !== "dead";

  return (
    <div className="space-y-6">
      <Link href="/deals" className="inline-flex items-center gap-2 text-sm text-ink-400 hover:text-ink-200">
        <ArrowLeft className="h-4 w-4" />
        Back to deals
      </Link>

      <header className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.address}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {d.beds ?? "?"}/{d.baths ?? "?"} · {d.sqft?.toLocaleString() ?? "?"} sqft ·{" "}
            {d.region ?? "—"}
          </p>
        </div>
        <span
          className={`badge ${
            d.status === "dead" ? "badge-dead" : alive ? "badge-alive" : "badge-muted"
          } text-sm`}
        >
          Score {d.deal_score} · {d.status}
        </span>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric label="Asking" value={`$${d.asking_price?.toLocaleString() ?? "—"}`} />
        <Metric label="ARV" value={`$${d.est_arv?.toLocaleString() ?? "—"}`} tone="emerald" />
        <Metric label="Repairs" value={`$${d.est_repairs?.toLocaleString() ?? "—"}`} />
        <Metric
          label="MAO (70%)"
          value={`$${
            d.est_arv && d.est_repairs
              ? Math.round(d.est_arv * 0.7 - d.est_repairs).toLocaleString()
              : "—"
          }`}
        />
      </section>

      {d.kill_reason && (
        <section className="card p-6 border-red-500/30 bg-red-500/5">
          <div className="text-xs uppercase tracking-widest text-red-300 mb-2">Kill reasons</div>
          <ul className="space-y-1 text-sm text-red-200">
            {d.kill_reason.split("; ").map((k, i) => (
              <li key={i}>• {k}</li>
            ))}
          </ul>
        </section>
      )}

      <DealActions
        dealId={d.id}
        isDead={!alive}
        hasMatches={rows.length > 0}
        hasPending={pending.length > 0}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-ink-200">
            Matched buyers{" "}
            <span className="text-ink-400 font-normal">({rows.length})</span>
          </h2>
          <div className="flex gap-2 text-xs">
            <span className="badge badge-muted">{pending.length} pending</span>
            <span className="badge badge-alive">{sent.length} sent</span>
            {drafts.length > 0 && <span className="badge badge-warn">{drafts.length} drafts</span>}
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="card p-10 text-center text-ink-400 text-sm">
            {alive
              ? "No matches yet. Click “Match buyers” above."
              : "Outreach disabled for killed deals."}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-ink-900/60 text-ink-400 text-xs uppercase tracking-widest">
                <tr>
                  <th className="text-left px-5 py-3">Buyer</th>
                  <th className="text-left px-5 py-3">Region</th>
                  <th className="text-left px-5 py-3">Channel</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-left px-5 py-3">Sent</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="table-row">
                    <td className="px-5 py-3 text-ink-100">
                      {r.buyer?.entity_name ?? r.buyer?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-ink-300">{r.buyer?.primary_region ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 text-ink-300">
                        {r.channel === "sms" ? (
                          <MessageSquare className="h-3.5 w-3.5" />
                        ) : (
                          <Mail className="h-3.5 w-3.5" />
                        )}
                        {r.channel}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {r.response_at ? (
                        <span className="badge badge-alive">replied</span>
                      ) : r.sent_at ? (
                        <span className="badge badge-muted">sent</span>
                      ) : r.message_text?.startsWith("[DRY RUN]") ? (
                        <span className="badge badge-warn">draft</span>
                      ) : (
                        <span className="badge badge-muted">pending</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-400 text-xs">
                      {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
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

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald";
}) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-widest text-ink-400">{label}</div>
      <div
        className={`mt-2 font-mono text-2xl tabular-nums ${tone === "emerald" ? "text-emerald-300" : "text-ink-100"}`}
      >
        {value}
      </div>
    </div>
  );
}
