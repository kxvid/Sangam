import { supabase } from "../lib/supabase";
import { completeText } from "../lib/anthropic";
import type { Buyer, Deal } from "../types";

const PROPERTY_TYPE_DEFAULT = "sfr";

export type MatchResult = {
  deal: Deal;
  matches: Buyer[];
  eligibleCount: number;
  thinPool: boolean;
};

export async function matchBuyers(dealId: string): Promise<MatchResult> {
  const { data: deal, error: dErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (dErr || !deal) throw new Error(`Deal not found: ${dealId}`);
  const d = deal as Deal;
  if (d.status === "dead") throw new Error("Deal is dead, refuse to match");

  const asking = d.asking_price ?? 0;
  const region = d.region;

  let q = supabase
    .from("buyers")
    .select("*")
    .eq("active_flag", true)
    .or(`min_price.is.null,min_price.lte.${asking}`)
    .or(`max_price.is.null,max_price.gte.${asking}`)
    .or(`property_types.is.null,property_types.cs.{${PROPERTY_TYPE_DEFAULT}}`);

  if (region) {
    q = q.or(`primary_region.eq.${region},secondary_regions.cs.{${region}}`);
  }

  const { data: candidates, error: cErr } = await q.limit(200);
  if (cErr) throw cErr;

  const pool = (candidates ?? []) as Buyer[];

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: recent, error: rErr } = await supabase
    .from("outreach")
    .select("buyer_id")
    .eq("deal_id", dealId)
    .gte("sent_at", sevenDaysAgo);
  if (rErr) throw rErr;
  const pitched = new Set((recent ?? []).map((r) => r.buyer_id));
  const eligible = pool.filter((b) => !pitched.has(b.id));

  const ninetyDaysAgo = Date.now() - 90 * 24 * 3600 * 1000;
  eligible.sort((a, b) => {
    const aRecent = a.last_purchase_date && Date.parse(a.last_purchase_date) > ninetyDaysAgo ? 1 : 0;
    const bRecent = b.last_purchase_date && Date.parse(b.last_purchase_date) > ninetyDaysAgo ? 1 : 0;
    if (aRecent !== bRecent) return bRecent - aRecent;
    if (a.source_confidence !== b.source_confidence)
      return b.source_confidence - a.source_confidence;
    return b.total_properties_owned - a.total_properties_owned;
  });

  const top50 = eligible.slice(0, 50);
  const thinPool = top50.length < 10;

  if (top50.length === 0) {
    return { deal: d, matches: [], eligibleCount: 0, thinPool: true };
  }

  let ranked: string[];
  try {
    const prompt = `You are ranking ${top50.length} cash buyer candidates against a specific real estate deal.
Return a JSON array of the top 20 buyer_ids ranked by likelihood of interest.

Deal: ${d.beds ?? "?"}/${d.baths ?? "?"}, ${d.sqft ?? "?"} sqft, asking $${asking}, ARV $${d.est_arv}, in ${d.zip ?? d.region ?? "?"}.

Buyers: ${JSON.stringify(
      top50.map((b) => ({
        id: b.id,
        entity: b.entity_name,
        region: b.primary_region,
        strategy: b.strategy,
        last: b.last_purchase_date,
        owned: b.total_properties_owned,
        conf: b.source_confidence,
      })),
    )}

Output: ["buyer_id_1", "buyer_id_2", ...] only. No commentary.`;
    const raw = await completeText(prompt, { maxTokens: 2048 });
    const match = raw.match(/\[[\s\S]*\]/);
    ranked = match ? JSON.parse(match[0]) : top50.slice(0, 20).map((b) => b.id);
  } catch {
    ranked = top50.slice(0, 20).map((b) => b.id);
  }

  const idSet = new Set(top50.map((b) => b.id));
  ranked = ranked.filter((id) => idSet.has(id)).slice(0, 20);

  const orderedBuyers = ranked
    .map((id) => top50.find((b) => b.id === id))
    .filter((b): b is Buyer => Boolean(b));

  const rows = orderedBuyers.map((b, i) => ({
    deal_id: dealId,
    buyer_id: b.id,
    channel: (i < 10 ? "sms" : "email") as "sms" | "email",
  }));

  if (rows.length) {
    const { error: oErr } = await supabase.from("outreach").insert(rows);
    if (oErr) throw oErr;
  }

  return { deal: d, matches: orderedBuyers, eligibleCount: eligible.length, thinPool };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx src/jobs/match-buyers.ts <deal_id>");
    process.exit(1);
  }
  matchBuyers(id)
    .then((r) => {
      console.log(`DEAL: ${r.deal.address} (score ${r.deal.deal_score})`);
      console.log(`MATCHED: ${r.matches.length} of ${r.eligibleCount} eligible`);
      if (r.thinPool) console.log("WARN: thin pool, run discovery for this region");
      r.matches.forEach((b, i) => {
        console.log(
          `${i + 1}. ${b.entity_name ?? b.full_name} — ${b.primary_region}, last ${b.last_purchase_date ?? "—"}`,
        );
      });
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
