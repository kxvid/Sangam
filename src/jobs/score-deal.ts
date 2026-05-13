import { supabase } from "../lib/supabase.js";
import { getProperty, getSaleAvm } from "../lib/rentcast.js";

type Args = {
  address: string;
  askingPrice: number;
  claimedArv?: number;
};

function parseArgs(): Args {
  const [address, ask, claimed] = process.argv.slice(2);
  if (!address || !ask) {
    throw new Error('Usage: tsx src/jobs/score-deal.ts "<address>" <asking> [claimed_arv]');
  }
  return {
    address,
    askingPrice: Number(ask),
    claimedArv: claimed ? Number(claimed) : undefined,
  };
}

function repairTier(sqft: number, hint: "cosmetic" | "gut" | "addition" = "gut"): number {
  const perSqft = hint === "cosmetic" ? 40 : hint === "gut" ? 80 : 150;
  return sqft * perSqft;
}

function score(arv: number, repairs: number, asking: number): number {
  const mao = arv * 0.7 - repairs;
  const raw = 100 * Math.max(0, (mao - asking) / Math.max(1, mao) + 0.3);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export async function scoreDeal(args: Args) {
  const subject = await getProperty(args.address);
  const avm = await getSaleAvm(args.address);

  const sqft = subject.squareFootage ?? 0;
  const arv = avm.price;
  const repairs = repairTier(sqft, "gut");
  const mao = arv * 0.7 - repairs;
  const dealScore = score(arv, repairs, args.askingPrice);

  let status: "new" | "dead" = "new";
  let killReason: string | null = null;

  if (args.askingPrice > arv * 0.85) {
    status = "dead";
    killReason = `Asking $${args.askingPrice} exceeds 85% of computed ARV ($${arv}).`;
  }
  if (dealScore < 30) {
    status = "dead";
    killReason = killReason ?? `Score ${dealScore} below kill threshold.`;
  }

  const { data, error } = await supabase
    .from("deals")
    .insert({
      address: args.address,
      asking_price: args.askingPrice,
      est_arv: arv,
      est_repairs: repairs,
      beds: subject.bedrooms,
      baths: subject.bathrooms,
      sqft,
      deal_score: dealScore,
      status,
      kill_reason: killReason,
    })
    .select()
    .single();

  if (error) throw error;

  console.log(`DEAL: ${args.address}`);
  console.log(`ASKING: $${args.askingPrice}`);
  console.log(`ARV: $${arv}`);
  console.log(`REPAIRS: $${repairs}`);
  console.log(`MAO: $${Math.round(mao)}`);
  console.log(`SCORE: ${dealScore}`);
  console.log(`STATUS: ${status}`);
  if (killReason) console.log(`KILL REASON: ${killReason}`);
  console.log(`DEAL ID: ${data.id}`);

  return data;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scoreDeal(parseArgs()).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
