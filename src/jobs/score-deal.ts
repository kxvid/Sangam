import { disabled } from '../lib/manual-only';
import type { Buyer, Deal } from '../types';
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

export async function scoreDeal(_input:ScoreDealInput):Promise<ScoreDealResult>{return disabled('Automatic deal scoring');}

if(import.meta.url === 'file://'+process.argv[1]) { console.error('This legacy job is disabled in the manual Acquisition release. Open the Acquisition workspace.'); process.exitCode=1; }
