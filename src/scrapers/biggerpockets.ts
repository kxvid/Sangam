import { disabled } from '../lib/manual-only';
export type BPMember = {
  name: string;
  city: string | null;
  state: string;
  roles: string[];
  profileUrl: string;
};

export async function scrapeCAInvestors(_max = 200): Promise<BPMember[]> {
  return disabled('External scraping');
}
