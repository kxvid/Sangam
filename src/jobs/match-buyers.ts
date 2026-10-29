import { disabled } from '../lib/manual-only';
import type { Buyer, Deal } from '../types';
export type MatchResult = {
  deal: Deal;
  matches: Buyer[];
  eligibleCount: number;
  thinPool: boolean;
};

export async function matchBuyers(_dealId:string):Promise<MatchResult>{return disabled('Legacy automatic buyer matching');}

if(import.meta.url === 'file://'+process.argv[1]) { console.error('This legacy job is disabled in the manual Acquisition release. Open the Acquisition workspace.'); process.exitCode=1; }
