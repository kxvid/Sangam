// LA County Recorder grant deed scraper.
// Pulls grant deeds filed in last N days, filters to deeds with no concurrent
// deed of trust (cash purchase signal). Returns normalized buyer rows for
// upsert into the buyers table.
//
// TODO: implement against https://rrcc.lacounty.gov/ search portal. The portal
// requires session cookies and form posts; use Playwright. Respect robots.txt
// and run nightly only, not in tight loops.

export type RecorderRow = {
  granteeName: string;
  granteeEntity: string | null;
  propertyAddress: string;
  recordedDate: string;
  isCash: boolean;
};

export async function fetchRecentGrantDeeds(_daysBack = 30): Promise<RecorderRow[]> {
  return [];
}
