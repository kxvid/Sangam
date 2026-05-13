"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ScoreDealResult } from "@/src/jobs/score-deal";

export function ScoreForm() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [asking, setAsking] = useState("");
  const [claimed, setClaimed] = useState("");
  const [tier, setTier] = useState<"cosmetic" | "gut" | "addition">("gut");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreDealResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          askingPrice: Number(asking),
          claimedArv: claimed ? Number(claimed) : undefined,
          repairTier: tier,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      setResult(await r.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-ink-400 mb-2">
            Property address
          </label>
          <input
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="229 Angus Ave E, San Bruno, CA 94066"
            className="input w-full px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-ink-400 mb-2">
              Asking price ($)
            </label>
            <input
              required
              type="number"
              min={0}
              value={asking}
              onChange={(e) => setAsking(e.target.value)}
              placeholder="780000"
              className="input w-full px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-widest text-ink-400 mb-2">
              Wholesaler ARV claim (opt.)
            </label>
            <input
              type="number"
              min={0}
              value={claimed}
              onChange={(e) => setClaimed(e.target.value)}
              placeholder="1255000"
              className="input w-full px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium uppercase tracking-widest text-ink-400 mb-2">
            Repair tier
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["cosmetic", "gut", "addition"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={`btn ${tier === t ? "btn-primary" : "btn-ghost"} capitalize`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">
            Cosmetic $40/sqft · Gut $80/sqft · Addition $150/sqft
          </p>
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Score deal"}
        </button>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </form>

      <div className="card p-6">
        {!result && !loading && (
          <div className="h-full grid place-items-center text-ink-400 text-sm">
            Results will appear here.
          </div>
        )}
        {loading && (
          <div className="h-full grid place-items-center text-ink-400 text-sm">
            <Loader2 className="h-6 w-6 animate-spin mb-3" />
            Pulling comps and computing ARV…
          </div>
        )}
        {result && <ScoreResult r={result} onView={() => router.push(`/deals/${result.deal.id}`)} />}
      </div>
    </div>
  );
}

function ScoreResult({ r, onView }: { r: ScoreDealResult; onView: () => void }) {
  const alive = r.status === "new";
  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-ink-400 uppercase tracking-widest">Result</div>
          <div className="mt-1 font-mono text-2xl tabular-nums">
            <span className={alive ? "text-emerald-300" : "text-red-300"}>{r.score}</span>
            <span className="text-ink-500 text-base"> / 100</span>
          </div>
        </div>
        <span className={`badge ${alive ? "badge-alive" : "badge-dead"}`}>
          {alive ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {alive ? "Worth pitching" : "Dead"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="ARV (computed)" value={`$${r.arv.toLocaleString()}`} />
        <Stat label="MAO (70% rule)" value={`$${r.mao.toLocaleString()}`} />
        <Stat label="Repairs" value={`$${r.repairs.toLocaleString()}`} sub={r.repairTier} />
        <Stat label="Comps used" value={r.comps.length.toString()} />
      </dl>

      <div className="text-xs text-ink-400 border-t border-ink-800 pt-3">{r.arvBasis}</div>

      {r.killReasons.length > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <div className="text-xs uppercase tracking-widest text-red-300 mb-2">Kill reasons</div>
          <ul className="space-y-1 text-sm text-red-200">
            {r.killReasons.map((k, i) => (
              <li key={i} className="leading-snug">
                • {k}
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.claimVsReality && (
        <div className="rounded-lg border border-ink-700 bg-ink-800/40 p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-ink-400 mb-2">
            Claim vs reality
          </div>
          <div className="flex items-baseline justify-between font-mono">
            <span>Claimed ${r.claimVsReality.claimed.toLocaleString()}</span>
            <span className="text-ink-500">vs</span>
            <span>Computed ${r.claimVsReality.computed.toLocaleString()}</span>
            <span
              className={
                r.claimVsReality.deltaPct > 20
                  ? "text-red-300"
                  : r.claimVsReality.deltaPct < -10
                    ? "text-emerald-300"
                    : "text-ink-300"
              }
            >
              {r.claimVsReality.deltaPct > 0 ? "+" : ""}
              {r.claimVsReality.deltaPct}%
            </span>
          </div>
        </div>
      )}

      <button onClick={onView} className="btn btn-ghost w-full">
        View deal detail <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-400">{label}</dt>
      <dd className="mt-1 font-mono text-base tabular-nums">{value}</dd>
      {sub && <div className="text-xs text-ink-500 capitalize">{sub}</div>}
    </div>
  );
}
