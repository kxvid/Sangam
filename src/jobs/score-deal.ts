import { supabase } from "../lib/supabase.js";
import { getProperty, getSaleAvm, type RentCastAvm } from "../lib/rentcast.js";

type RepairTier = "cosmetic" | "gut" | "addition";

type Args = {
  address: string;
  askingPrice: number;
  claimedArv?: number;
  repairTier?: RepairTier;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    throw new Error(
      'Usage: tsx src/jobs/score-deal.ts "<address>" <asking> [claimed_arv] [--repairs=cosmetic|gut|addition]',
    );
  }
  const flags = argv.filter((a) => a.startsWith("--"));
  const positional = argv.filter((a) => !a.startsWith("--"));
  const [address, ask, claimed] = positional;
  const repairFlag = flags.find((f) => f.startsWith("--repairs="));
  const tier = repairFlag?.split("=")[1] as RepairTier | undefined;
  return {
    address,
    askingPrice: Number(ask),
    claimedArv: claimed ? Number(claimed) : undefined,
    repairTier: tier ?? "gut",
  };
}

function parseLocation(address: string): { zip: string | null; region: string | null } {
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  const parts = address.split(",").map((s) => s.trim());
  // "229 Angus Ave E, San Bruno, CA 94066" -> ["...","San Bruno","CA 94066"]
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

function daysSince(iso: string | undefined): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / (24 * 3600 * 1000);
}

type QualifiedComp = {
  address: string;
  beds: number;
  baths: number;
  sqft: number;
  price: number;
  soldDate: string;
  pricePerSqft: number;
};

function filterComps(
  comps: RentCastAvm["comparables"],
  subject: { beds: number; baths: number; sqft: number },
): QualifiedComp[] {
  const minSqft = subject.sqft * 0.8;
  const maxSqft = subject.sqft * 1.2;

  const qualified: QualifiedComp[] = [];
  for (const c of comps ?? []) {
    if (!c.squareFootage || !c.price) continue;
    const soldDate = c.removedDate ?? c.listedDate ?? "";
    const age = daysSince(soldDate);
    if (age > 180) continue;
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
  // Reject extreme outliers in $/sqft (>1.5x or <0.5x of running median).
  const med = median(qualified.map((c) => c.pricePerSqft));
  return qualified.filter((c) => c.pricePerSqft >= med * 0.5 && c.pricePerSqft <= med * 1.5);
}

function score(arv: number, repairs: number, asking: number): number {
  if (arv <= 0) return 0;
  const mao = arv * 0.7 - repairs;
  const raw = 100 * ((mao - asking) / Math.max(1, mao) + 0.3);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export async function scoreDeal(args: Args) {
  const subject = await getProperty(args.address);
  const avm = await getSaleAvm(args.address);
  const { zip, region } = parseLocation(args.address);

  const sqft = subject.squareFootage ?? 0;
  const beds = subject.bedrooms ?? 0;
  const baths = subject.bathrooms ?? 0;

  const qualified = filterComps(avm.comparables ?? [], { beds, baths, sqft });

  let arv: number;
  let arvBasis: string;
  if (qualified.length >= 3 && sqft > 0) {
    const medianPpsf = median(qualified.map((c) => c.pricePerSqft));
    arv = Math.round(medianPpsf * sqft);
    arvBasis = `median $/sqft of ${qualified.length} qualified comps × ${sqft} sqft`;
  } else {
    arv = Math.round(avm.price ?? 0);
    arvBasis = `RentCast AVM fallback (only ${qualified.length} qualified comps found)`;
  }

  const tier = args.repairTier ?? "gut";
  const repairs = Math.round(sqft * repairPerSqft(tier));
  const mao = Math.round(arv * 0.7 - repairs);
  const dealScore = score(arv, repairs, args.askingPrice);

  const killReasons: string[] = [];

  if (qualified.length < 3) {
    killReasons.push(
      `Only ${qualified.length} qualified comps found within 180d / bed±1 / bath±0.5 / sqft±20% (need 3+)`,
    );
  }

  if (args.askingPrice > arv * 0.85) {
    killReasons.push(
      `Asking $${args.askingPrice.toLocaleString()} exceeds 85% of computed ARV ($${arv.toLocaleString()} × 0.85 = $${Math.round(arv * 0.85).toLocaleString()})`,
    );
  }

  const lastSalePrice = subject.lastSalePrice ?? 0;
  const lastSaleAge = daysSince(subject.lastSaleDate);
  if (lastSaleAge <= 90 && lastSalePrice > 0 && lastSalePrice < args.askingPrice * 0.8) {
    killReasons.push(
      `Subject sold $${lastSalePrice.toLocaleString()} on ${subject.lastSaleDate} (${Math.round(lastSaleAge)}d ago), current ask is ${Math.round((args.askingPrice / lastSalePrice - 1) * 100)}% markup over recent arms-length sale with no improvements (markup play, not motivated seller)`,
    );
  }

  if (args.claimedArv && args.claimedArv > arv * 1.2) {
    killReasons.push(
      `Wholesaler claimed ARV $${args.claimedArv.toLocaleString()} is ${Math.round((args.claimedArv / arv - 1) * 100)}% above computed ARV $${arv.toLocaleString()} — likely inflated comp (different school zone, view, or topography class)`,
    );
  }

  if (dealScore < 30) {
    killReasons.push(`Score ${dealScore} below kill threshold of 30`);
  }

  const status: "new" | "dead" = killReasons.length > 0 ? "dead" : "new";
  const killReason = killReasons.length ? killReasons.join("; ") : null;

  const { data, error } = await supabase
    .from("deals")
    .insert({
      address: args.address,
      zip,
      region,
      asking_price: args.askingPrice,
      est_arv: arv,
      est_repairs: repairs,
      beds,
      baths,
      sqft,
      deal_score: dealScore,
      status,
      kill_reason: killReason,
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`DEAL: ${args.address}`);
  console.log(`ASKING: $${args.askingPrice.toLocaleString()}`);
  console.log(`ARV (computed): $${arv.toLocaleString()}  [${arvBasis}]`);
  console.log(`REPAIRS (${tier} @ $${repairPerSqft(tier)}/sqft): $${repairs.toLocaleString()}`);
  console.log(`MAO: $${mao.toLocaleString()}`);
  console.log(`SCORE: ${dealScore}`);
  console.log(`STATUS: ${status}`);
  if (killReason) console.log(`KILL REASON: ${killReason}`);

  console.log(`\nCOMPS USED (${qualified.length}):`);
  for (const c of qualified.slice(0, 5)) {
    console.log(
      `- ${c.address}: ${c.beds}/${c.baths}, ${c.sqft} sqft, sold $${c.price.toLocaleString()} on ${c.soldDate} ($${Math.round(c.pricePerSqft)}/sqft)`,
    );
  }

  if (args.claimedArv) {
    console.log(
      `\nWHOLESALER CLAIM vs REALITY: claimed $${args.claimedArv.toLocaleString()} / computed $${arv.toLocaleString()} (${Math.round((args.claimedArv / Math.max(1, arv) - 1) * 100)}% delta)`,
    );
  }

  console.log(`\nDEAL ID: ${data.id}`);
  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scoreDeal(parseArgs()).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
