"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Eye, Zap } from "lucide-react";

export function DealActions({
  dealId,
  isDead,
  hasMatches,
  hasPending,
}: {
  dealId: string;
  isDead: boolean;
  hasMatches: boolean;
  hasPending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"match" | "preview" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function call(path: string, body: object, label: typeof busy) {
    setBusy(label);
    setError(null);
    setFlash(null);
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");
      if (label === "match") setFlash(`Matched ${j.matches?.length ?? 0} buyers`);
      if (label === "preview") setFlash(`Generated ${j.smsSent + j.emailSent} draft messages`);
      if (label === "send") setFlash(`Sent ${j.smsSent} SMS + ${j.emailSent} emails`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (isDead) {
    return (
      <div className="card p-6 border-red-500/30 bg-red-500/5">
        <div className="text-sm text-red-200">
          This deal was killed. Outreach is disabled. Review the kill reasons before pitching to
          buyers.
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4">
      <h3 className="text-sm font-medium text-ink-200">Actions</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={() => call("/api/match", { dealId }, "match")}
          disabled={!!busy}
          className="btn btn-ghost"
        >
          {busy === "match" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {hasMatches ? "Re-match buyers" : "Match buyers"}
        </button>
        <button
          onClick={() => call("/api/outreach", { dealId, dryRun: true }, "preview")}
          disabled={!!busy || !hasPending}
          className="btn btn-ghost"
        >
          {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          Preview messages
        </button>
        <button
          onClick={() => {
            if (!confirm("Send live SMS + email to all pending buyers for this deal?")) return;
            call("/api/outreach", { dealId }, "send");
          }}
          disabled={!!busy || !hasPending}
          className="btn btn-primary"
        >
          {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send live blast
        </button>
      </div>
      {flash && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          {flash}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
