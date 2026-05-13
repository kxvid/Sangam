import { supabase } from "../lib/supabase.js";
import { completeText } from "../lib/anthropic.js";
import type { Buyer, Deal } from "../types.js";

export async function matchBuyers(dealId: string) {
  const { data: deal, error: dErr } = await supabase
    .from("deals")
    .select("*")
    .eq("id", dealId)
    .single();
  if (dErr || !deal) throw new Error(`Deal not found: ${dealId}`);
  const d = deal as Deal;
  if (d.status === "dead") throw new Error("Deal is dead, refuse to match");

  const { data: candidates, error: cErr } = await supabase
    .from("buyers")
    .select("*")
    .eq("active_flag", true)
    .lte("min_price", d.asking_price ?? Number.MAX_SAFE_INTEGER)
    .gte("max_price", d.asking_price ?? 0)
    .order("source_confidence", { ascending: false })
    .order("total_properties_owned", { ascending: false })
    .limit(50);
  if (cErr) throw cErr;

  const pool = (candidates ?? []) as Buyer[];
  if (pool.length === 0) {
    console.log("No candidates matched. Refresh discovery for this region.");
    return [];
  }

  const prompt = `You are ranking ${pool.length} cash buyer candidates against a specific real estate deal.
Return a JSON array of the top 20 buyer_ids ranked by likelihood of interest.

Deal: ${d.beds ?? "?"}/${d.baths ?? "?"}, ${d.sqft ?? "?"} sqft, asking $${d.asking_price}, ARV $${d.est_arv}, in ${d.zip ?? d.region ?? "?"}.

Buyers: ${JSON.stringify(pool.map((b) => ({ id: b.id, entity: b.entity_name, region: b.primary_region, strategy: b.strategy, last: b.last_purchase_date, owned: b.total_properties_owned, conf: b.source_confidence })))}

Output: ["buyer_id_1", "buyer_id_2", ...] only. No commentary.`;

  const raw = await completeText(prompt, { maxTokens: 2048 });
  const match = raw.match(/\[[\s\S]*\]/);
  const ranked: string[] = match ? JSON.parse(match[0]) : pool.slice(0, 20).map((b) => b.id);

  const rows = ranked.slice(0, 20).map((buyerId, i) => ({
    deal_id: dealId,
    buyer_id: buyerId,
    channel: (i < 10 ? "sms" : "email") as "sms" | "email",
  }));

  if (rows.length) {
    const { error: oErr } = await supabase.from("outreach").insert(rows);
    if (oErr) throw oErr;
  }

  console.log(`DEAL: ${d.address} (score ${d.deal_score})`);
  console.log(`MATCHED BUYERS: ${rows.length} of ${pool.length}`);
  return ranked;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: tsx src/jobs/match-buyers.ts <deal_id>");
    process.exit(1);
  }
  matchBuyers(id).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
