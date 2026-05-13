import { supabase } from "../lib/supabase";
import { getProperty, getSaleAvm, type RentCastAvm } from "../lib/rentcast";
import type { Deal } from "../types";

export type RepairTier = "cosmetic" | "gut" | "addition";

export type ScoreDealInput = {
  address: string;
  askingPrice: number;
  claimedArv?: number;
  repairTier?: RepairTier;
};

export type QualifiedComp = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  soldDate: string;
  pricePerSqft: number;
};

export type ScoreDealResult = {
  deal: Deal;
  arv: number;
  arvBasis: string;
  repairs: number;
  repairTier: RepairTier;
  mao: number;
  score: number;
  status: "new" | "dead";
  killReasons: string[];
  comps: QualifiedComp[];
  claimVsReality: { claimed: number; computed: number; deltaPct: number } | null;
};

function parseLocation(address: string): { zip: string | null; region: string | null } {
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const parts = address.split(",").map((s) => s.trim());
  const region = parts.length >= 2 ? parts[parts.length - 2] : null;
  return { zip: zipMatch ? zipMatch[1] : null, region };
}

function repairPerSqft(tier: RepairTier): number {
  return tier === "cosmetic" ? 40 : tier === "gut" ? 80 : 150;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function daysSince(iso: string | undefined | null): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (24 * 3600 * 1000);
}

function filterComps(
  comps: RentCastAvm["comparables"],
  subject: { beds: number; baths: number; sqft: number },
): QualifiedComp[] {
  if (subject.sqft <= 0) return [];
  const minSqft = subject.sqft * 0.8;
  const maxSqft = subject.sqft * 1.2;

  const qualified: QualifiedComp[] = [];
  for (const c of comps ?? []) {
    if (!c.squareFootage || !c.price) continue;
    const soldDate = c.removedDate ?? c.listedDate ?? "";
    if (daysSince(soldDate) > 180) continue;
    if (Math.abs((c.bedrooms ?? 0) - subject.beds) > 1) continue;
    if (Math.abs((c.bathrooms ?? 0) - subject.baths) > 0.5) continue;
    if (c.squareFootage < minSqft || c.squareFootage > maxSqft) continue;

    qualified.push({
      address: c.formattedAddress,
      beds: c.bedrooms ?? 0,
      baths: c.bathrooms ?? 0,
      sqft: c.squareFootage,
      price: c.price,
      soldDate,
      pricePerSqft: c.price / c.squareFootage,
    });
  }

  if (qualified.length === 0) return qualified;
  const med = median(qualified.map((c) => c.pricePerSqft));
  return qualified.filter((c) => c.pricePerSqft >= med * 0.5 && c.pricePerSqft <= med * 1.5);
}

function computeScore(arv: number, repairs: number, asking: number): number {
  if (arv <= 0) return 0;
  const mao = arv * 0.7 - repairs;
  const raw = 100 * ((mao - asking) / Math.max(1, mao) + 0.3);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export async function scoreDeal(input: ScoreDealInput): Promise<ScoreDealResult> {
  const subject = await getProperty(input.address);
  const avm = await getSaleAvm(input.address);
  const { zip, region } = parseLocation(input.address);

  const sqft = subject.squareFootage ?? 0;
  const beds = subject.bedrooms ?? 0;
  const baths = subject.bathrooms ?? 0;

  const comps = filterComps(avm.comparables ?? [], { beds, baths, sqft });

  let arv: number;
  let arvBasis: string;
  if (comps.length >= 3 && sqft > 0) {
    const medianPpsf = median(comps.map((c) => c.pricePerSqft));
    arv = Math.round(medianPpsf * sqft);
    arvBasis = `median $/sqft of ${comps.length} qualified comps × ${sqft} sqft`;
  } else {
    arv = Math.round(avm.price ?? 0);
    arvBasis = `RentCast AVM fallback (only ${comps.length} qualified comps)`;
  }

  const repairTier = input.repairTier ?? "gut";
  const repairs = Math.round(sqft * repairPerSqft(repairTier));
  const mao = Math.round(arv * 0.7 - repairs);
  const score = computeScore(arv, repairs, input.askingPrice);

  const killReasons: string[] = [];

  if (comps.length < 3) {
    killReasons.push(
      `Only ${comps.length} qualified comps found within 180d / bed±1 / bath±0.5 / sqft±20% (need 3+)`,
    );
  }

  if (input.askingPrice > arv * 0.85) {
    killReasons.push(
      `Asking $${input.askingPrice.toLocaleString()} exceeds 85% of computed ARV ($${arv.toLocaleString()})`,
    );
  }

  const lastSalePrice = subject.lastSalePrice ?? 0;
  const lastSaleAge = daysSince(subject.lastSaleDate);
  if (lastSaleAge <= 90 && lastSalePrice > 0 && lastSalePrice < input.askingPrice * 0.8) {
    killReasons.push(
      `Subject sold $${lastSalePrice.toLocaleString()} on ${subject.lastSaleDate} (${Math.round(lastSaleAge)}d ago), current ask is a ${Math.round((input.askingPrice / lastSalePrice - 1) * 100)}% markup over recent arms-length sale — markup play, not motivated seller`,
    );
  }

  let claimVsReality: ScoreDealResult["claimVsReality"] = null;
  if (input.claimedArv) {
    const deltaPct = Math.round((input.claimedArv / Math.max(1, arv) - 1) * 100);
    claimVsReality = { claimed: input.claimedArv, computed: arv, deltaPct };
    if (input.claimedArv > arv * 1.2) {
      killReasons.push(
        `Wholesaler claimed ARV $${input.claimedArv.toLocaleString()} is ${deltaPct}% above computed ARV — likely inflated comp (different school zone, view, or topography)`,
      );
    }
  }

  if (score < 30) {
    killReasons.push(`Score ${score} below kill threshold of 30`);
  }

  const status: "new" | "dead" = killReasons.length > 0 ? "dead" : "new";
  const killReason = killReasons.length ? killReasons.join("; ") : null;

  const { data, error } = await supabase
    .from("deals")
    .insert({
      address: input.address,
      zip,
      region,
      asking_price: input.askingPrice,
      est_arv: arv,
      est_repairs: repairs,
      beds,
      baths,
      sqft,
      deal_score: score,
      status,
      kill_reason: killReason,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    deal: data as Deal,
    arv,
    arvBasis,
    repairs,
    repairTier,
    mao,
    score,
    status,
    killReasons,
    comps,
    claimVsReality,
  };
}

function parseCliArgs(): ScoreDealInput {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    throw new Error(
      'Usage: tsx src/jobs/score-deal.ts "<address>" <asking> [claimed_arv] [--repairs=cosmetic|gut|addition]',
    );
  }
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const [address, ask, claimed] = positional;
  const tier = flags.find((f) => f.startsWith("--repairs="))?.split("=")[1] as
    | RepairTier
    | undefined;
  return {
    address,
    askingPrice: Number(ask),
    claimedArv: claimed ? Number(claimed) : undefined,
    repairTier: tier ?? "gut",
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scoreDeal(parseCliArgs())
    .then((r) => {
      console.log(`DEAL: ${r.deal.address}`);
      console.log(`ASKING: $${r.deal.asking_price?.toLocaleString()}`);
      console.log(`ARV: $${r.arv.toLocaleString()}  [${r.arvBasis}]`);
      console.log(`REPAIRS (${r.repairTier}): $${r.repairs.toLocaleString()}`);
      console.log(`MAO: $${r.mao.toLocaleString()}`);
      console.log(`SCORE: ${r.score}`);
      console.log(`STATUS: ${r.status}`);
      if (r.killReasons.length) console.log(`KILL REASONS:\n - ${r.killReasons.join("\n - ")}`);
      console.log(`\nCOMPS (${r.comps.length}):`);
      for (const c of r.comps.slice(0, 5)) {
        console.log(
          `- ${c.address}: ${c.beds}/${c.baths}, ${c.sqft} sqft, sold $${c.price.toLocaleString()} on ${c.soldDate} ($${Math.round(c.pricePerSqft)}/sqft)`,
        );
      }
      console.log(`\nDEAL ID: ${r.deal.id}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
