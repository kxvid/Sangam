// BiggerPockets member directory scraper.
// Filters: location = CA, role in (investor, flipper, landlord).
//
// TODO: implement via Playwright. Login required for full profile data;
// store session in BP_SESSION env var. Cap pagination at 20 pages/run.

export type BPMember = {
  name: string;
  city: string | null;
  state: string;
  roles: string[];
  profileUrl: string;
};

export async function scrapeCAInvestors(_max = 200): Promise<BPMember[]> {
  return [];
}
