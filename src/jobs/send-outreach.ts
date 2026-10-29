import { disabled } from '../lib/manual-only';
import type { Buyer, Deal } from '../types';
export type SendOutreachOpts = { dryRun?: boolean; skipWindow?: boolean };
export type SendOutreachResult = {
  deal: Deal;
  smsSent: number;
  emailSent: number;
  skipped: number;
  errors: string[];
  dryRun: boolean;
};

export async function sendOutreach(_dealId:string,_opts:SendOutreachOpts={}):Promise<SendOutreachResult>{return disabled('Outreach job');}

if(import.meta.url === 'file://'+process.argv[1]) { console.error('This legacy job is disabled in the manual Acquisition release. Open the Acquisition workspace.'); process.exitCode=1; }
