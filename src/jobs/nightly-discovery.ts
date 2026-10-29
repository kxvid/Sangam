import { disabled } from '../lib/manual-only';
import type { Buyer, Deal } from '../types';
export type DiscoveryResult = {
  added: number;
  updated: number;
  spent: number;
  errors: string[];
};

export async function runDiscovery():Promise<DiscoveryResult>{return disabled('Discovery job');}

if(import.meta.url === 'file://'+process.argv[1]) { console.error('This legacy job is disabled in the manual Acquisition release. Open the Acquisition workspace.'); process.exitCode=1; }
